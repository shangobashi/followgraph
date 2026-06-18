import type { LastScan, Progress, ScanSession, ScanSummary, StopReason } from "./types";
import { classifyUsers, summarize } from "./activity";
import { runApiFastPathEnrichment } from "./fastpath";
import { getFollowingPaginationState, installFollowingApiCapture, parseFollowingApiUsers } from "./followingApi";
import { parseVisibleUsers } from "./parser";
import { extractProfileActivity, unfollowCurrentProfile } from "./profile";
import { SCAN_MAX_IDLE_ROUNDS, decideScanIdle } from "./scanCompletion";
import { UserStore } from "./store";
import { runScrollLoop } from "./scroller";
import { ensureUI, uiEnableExport, uiSetFinalStatus, uiSetStatus, uiSetSummary, uiUpdateProgress } from "./ui";
import { LAST_SCAN_KEY, loadScanSession, saveLastScan, saveScanSession } from "./storage";

declare global {
  interface Window {
    __FOLLOWGRAPH_RUNNING__?: boolean;
    __FOLLOWGRAPH_LISTENER_READY__?: boolean;
    __FOLLOWGRAPH_STORAGE_SYNC_READY__?: boolean;
    __FOLLOWGRAPH_SCAN_COMPLETE__?: boolean;
    __FOLLOWGRAPH_SCAN_ABORT__?: boolean;
    __FOLLOWGRAPH_CURRENT_SESSION_ID__?: string;
  }
}

const SCAN_CHECKPOINT_USER_DELTA = 250;
const SCAN_CHECKPOINT_INTERVAL_MS = 3000;
const X_LOAD_RETRY_LIMIT = 3;

function isFollowingPage(): boolean {
  const hostOk = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(location.hostname);
  const pathOk = location.pathname.includes("/following");
  return hostOk && pathOk;
}

function followingOwner(urlString: string) {
  try {
    const url = new URL(urlString);
    return url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
  } catch {
    return "";
  }
}

function syncOverlayFromLastScan(last: LastScan) {
  ensureUI();
  uiSetSummary(last.summary);
  uiEnableExport(last.users);

  if (!window.__FOLLOWGRAPH_SCAN_COMPLETE__ || last.summary.Resolved <= 0) {
    return;
  }

  const remaining = Math.max(last.summary.total - last.summary.Resolved, 0);
  if (remaining > 0) {
    uiSetStatus(`Activity enrichment running (${last.summary.Resolved}/${last.summary.total} resolved)...`);
    return;
  }

  uiSetStatus("Activity enrichment complete.");
}

function registerStorageSync() {
  if (!isFollowingPage() || window.__FOLLOWGRAPH_STORAGE_SYNC_READY__) return;
  window.__FOLLOWGRAPH_STORAGE_SYNC_READY__ = true;

  chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== "local") return;
    const next = changes[LAST_SCAN_KEY]?.newValue as LastScan | undefined;
    if (!next) return;
    syncOverlayFromLastScan(next);
  });
}

function targetMet(summary: ScanSummary) {
  return summary.total > 0 && summary.Resolved / summary.total >= 0.9;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecoverableStop(reason: StopReason) {
  return reason === "xLoadError" || reason === "networkStall" || reason === "manualPause" || reason === "tabNavigated";
}

function stopMessage(reason: StopReason) {
  if (reason === "xLoadError") return "X stopped loading the Following page.";
  if (reason === "networkStall") return "The Following page stopped returning new profiles.";
  if (reason === "manualPause") return "Scan paused.";
  if (reason === "tabNavigated") return "The tab left the Following page.";
  if (reason === "hardCap") return "Scan stopped at the safety cap.";
  if (reason === "maxUsers") return "Scan stopped at the max users cap.";
  return "Scan complete.";
}

function resumeHint(reason: StopReason) {
  if (reason === "xLoadError") return "Fix X if needed, then click Resume scan.";
  if (reason === "networkStall") return "Wait for X to load again, then click Resume scan.";
  if (reason === "manualPause") return "Click Resume scan to continue from the saved checkpoint.";
  if (reason === "tabNavigated") return "Open the same /following page, then click Resume scan.";
  return null;
}

function createSession(tabId: number | null): ScanSession {
  const now = Date.now();
  return {
    id: createId(),
    status: "running",
    phase: "scanning",
    startedAt: now,
    updatedAt: now,
    sourceUrl: location.href,
    tabId,
    users: [],
    summary: null,
    progress: null,
    stopReason: null,
    error: null,
    canResume: true,
    resumeHint: null
  };
}

function detectXLoadIssue() {
  const main = document.querySelector('[role="main"], main') as HTMLElement | null;
  const text = (main?.innerText || document.body.innerText || "").toLowerCase();
  const hasErrorText =
    text.includes("something went wrong") ||
    text.includes("try reloading") ||
    text.includes("try again") ||
    text.includes("cannot retrieve") ||
    text.includes("posts aren't loading") ||
    text.includes("this page is down");

  const retryButton = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]')).find((button) => {
    const label = (button.innerText || button.getAttribute("aria-label") || "").trim().toLowerCase();
    return label === "retry" || label === "try again" || label.includes("retry") || label.includes("try again");
  });

  return hasErrorText || retryButton ? { hasErrorText, retryButton } : null;
}

function hasLoadingIndicator() {
  return Boolean(
    document.querySelector('[role="progressbar"], [aria-label*="Loading"], [aria-label*="loading"], [data-testid="primaryColumn"] svg[aria-label]')
  );
}

async function runScan(mode: "start" | "resume", tabId: number | null) {
  if (!isFollowingPage()) {
    ensureUI();
    uiSetStatus("Open a /following page first.");
    return;
  }

  const priorSession = mode === "resume" ? await loadScanSession().catch(() => null) : null;
  if (mode === "resume" && priorSession?.canResume) {
    const savedOwner = followingOwner(priorSession.sourceUrl);
    const currentOwner = followingOwner(location.href);
    if (savedOwner && currentOwner && savedOwner !== currentOwner) {
      const error = `Saved scan belongs to @${savedOwner}, but this page is @${currentOwner}/following.`;
      await saveScanSession({
        ...priorSession,
        status: "recoverable_error",
        error,
        canResume: true,
        resumeHint: `Open @${savedOwner}/following, then click Resume scan.`
      }).catch(() => {});
      ensureUI();
      uiSetStatus(error);
      return;
    }
  }

  const session = priorSession?.canResume ? priorSession : createSession(tabId);
  session.status = "running";
  session.phase = "scanning";
  session.tabId = tabId;
  session.sourceUrl = location.href;
  session.stopReason = null;
  session.error = null;
  session.canResume = true;
  session.resumeHint = null;
  await saveScanSession(session).catch(() => {});

  window.__FOLLOWGRAPH_SCAN_COMPLETE__ = false;
  window.__FOLLOWGRAPH_SCAN_ABORT__ = false;
  window.__FOLLOWGRAPH_CURRENT_SESSION_ID__ = session.id;
  ensureUI();
  uiSetStatus(mode === "resume" && session.users.length > 0 ? `Resuming scan from ${session.users.length} saved profiles...` : "Scanning...");
  installFollowingApiCapture();

  const store = new UserStore(session.users);
  let extractedTotal = 0;
  let apiHarvestRunning = false;
  let lastCheckpointAt = 0;
  let lastCheckpointSize = 0;
  let lastProgress: Progress | null = null;
  let xLoadRetries = 0;
  let checkpointChain: Promise<void> = Promise.resolve();

  function updateExtractedTotal() {
    extractedTotal = store.size();
  }

  updateExtractedTotal();

  async function checkpoint(force = false, patch: Partial<ScanSession> = {}) {
    const now = Date.now();
    if (!force && extractedTotal - lastCheckpointSize < SCAN_CHECKPOINT_USER_DELTA && now - lastCheckpointAt < SCAN_CHECKPOINT_INTERVAL_MS) {
      return;
    }

    const write = async () => {
      const values = store.values();
      const classified = classifyUsers(values, now);
      const summary = summarize(classified);
      const nextSession: ScanSession = {
        ...session,
        ...patch,
        users: values,
        summary,
        progress: lastProgress,
        updatedAt: now
      };
      await saveScanSession(nextSession);
      Object.assign(session, nextSession);
      lastCheckpointAt = now;
      lastCheckpointSize = extractedTotal;
    };

    const nextCheckpoint = checkpointChain.then(write, write);
    checkpointChain = nextCheckpoint.catch(() => {});

    try {
      await nextCheckpoint;
    } catch {
      // Checkpointing should never stop an active scan.
    }
  }

  async function drainCheckpoints() {
    await checkpointChain.catch(() => {});
  }

  async function saveSessionState(patch: Partial<ScanSession>) {
    await drainCheckpoints();
    const nextSession: ScanSession = {
      ...session,
      ...patch,
      updatedAt: Date.now()
    };
    await saveScanSession(nextSession);
    Object.assign(session, nextSession);
  }

  function harvestApiUsers() {
    if (apiHarvestRunning) return;
    apiHarvestRunning = true;
    void parseFollowingApiUsers()
      .then((users) => {
        if (users.length === 0) return;
        store.add(users);
        updateExtractedTotal();
      })
      .catch(() => {})
      .finally(() => {
        apiHarvestRunning = false;
      });
  }

  await checkpoint(true);

  const result = await runScrollLoop({
    maxIdleRounds: SCAN_MAX_IDLE_ROUNDS,
    shouldStop: () => {
      if (window.__FOLLOWGRAPH_SCAN_ABORT__) return "manualPause";
      if (!isFollowingPage()) return "tabNavigated";
      return null;
    },
    onTick: (tick) => {
      const visible = parseVisibleUsers();
      store.add(visible);
      updateExtractedTotal();
      harvestApiUsers();

      const progress: Progress = {
        ...tick,
        extractedTotal
      };

      lastProgress = progress;
      uiUpdateProgress(progress);
      const issue = detectXLoadIssue();
      if (issue) {
        if (issue.retryButton && xLoadRetries < X_LOAD_RETRY_LIMIT) {
          xLoadRetries += 1;
          issue.retryButton.click();
          uiSetStatus(`X load error detected. Retrying page load (${xLoadRetries}/${X_LOAD_RETRY_LIMIT})...`);
          void checkpoint(false, { error: "X load error detected; retrying page load." });
          return;
        }

        void checkpoint(true, {
          status: "recoverable_error",
          stopReason: "xLoadError",
          error: "X stopped loading the Following page.",
          canResume: true,
          resumeHint: resumeHint("xLoadError")
        });
        return "xLoadError";
      }

      if (!tick.progressed) {
        const loading = hasLoadingIndicator();
        const idleDecision = decideScanIdle({
          idleRounds: tick.idleRounds,
          extractedTotal,
          loading,
          pagination: getFollowingPaginationState()
        });

        if (idleDecision === "complete") {
          uiSetStatus("No more profiles are loading. Finishing scan...");
          return "idle";
        }

        if (idleDecision === "continue" && loading) {
          uiSetStatus("Scanning (waiting for next Following page)...");
          void checkpoint(false);
          return;
        }

        if (idleDecision === "recoverable_stall") {
          void checkpoint(true, {
          status: "recoverable_error",
          stopReason: "networkStall",
          error: "The Following page is still loading but no new profiles appeared.",
          canResume: true,
          resumeHint: resumeHint("networkStall")
          });
          return "networkStall";
        }
      }

      uiSetStatus(tick.progressed ? "Scanning..." : "Scanning (waiting for load)...");
      void checkpoint(false);
    }
  });

  const finalApiUsers = await parseFollowingApiUsers().catch(() => []);
  if (finalApiUsers.length > 0) {
    store.add(finalApiUsers);
    updateExtractedTotal();
  }

  uiSetFinalStatus(result.reason);

  const users = classifyUsers(store.values());
  const summary: ScanSummary = summarize(users);
  let latestUsers = users;
  let latestSummary = summary;

  uiSetSummary(summary);
  uiEnableExport(users);

  if (isRecoverableStop(result.reason)) {
    const message = stopMessage(result.reason);
    await saveSessionState({
      status: result.reason === "manualPause" ? "paused" : "recoverable_error",
      stopReason: result.reason,
      error: message,
      canResume: true,
      resumeHint: resumeHint(result.reason)
    });
    uiSetStatus(`${message} Saved ${users.length} profiles. ${resumeHint(result.reason) || ""}`.trim());
    return;
  }

  await drainCheckpoints();
  await saveLastScan(users, summary).catch(() => {});
  await saveSessionState({
    status: "running",
    phase: "api_fast_path",
    users: store.values(),
    summary,
    progress: lastProgress,
    stopReason: result.reason,
    error: null,
    canResume: false,
    resumeHint: null
  }).catch(() => {});
  window.__FOLLOWGRAPH_SCAN_COMPLETE__ = true;

  if (targetMet(summary)) {
    await saveSessionState({
      status: "completed",
      phase: "completed",
      users: store.values(),
      summary,
      progress: lastProgress,
      stopReason: result.reason,
      error: null,
      canResume: false,
      resumeHint: null
    }).catch(() => {});
    uiSetStatus("Scan complete. 90% resolution target met from captured following data.");
    return;
  }

  uiSetStatus("Scan complete. Starting activity enrichment...");

  const fastPath = await runApiFastPathEnrichment(users, summary, {
    onProgress: (message, nextSummary) => {
      uiSetSummary(nextSummary);
      uiSetStatus(message);
    }
  }).catch((error: unknown) => {
    console.warn("FollowGraph API fast path unavailable.", error);
    return null;
  });

  if (fastPath && (fastPath.resolved > 0 || targetMet(fastPath.summary))) {
    latestUsers = fastPath.users;
    latestSummary = fastPath.summary;
    uiSetSummary(fastPath.summary);
    uiEnableExport(fastPath.users);
    uiSetStatus(
      `API fast path resolved ${fastPath.resolved}/${fastPath.attempted} profiles. ${
        fastPath.shouldFallback ? "Starting helper-tab fallback for unresolved profiles..." : "Activity enrichment complete."
      }`
    );

    if (!fastPath.shouldFallback || targetMet(fastPath.summary)) {
      await saveSessionState({
        status: "completed",
        phase: "completed",
        users: fastPath.users,
        summary: fastPath.summary,
        progress: lastProgress,
        stopReason: result.reason,
        error: null,
        canResume: false,
        resumeHint: null
      }).catch(() => {});
      return;
    }
  }

  await saveSessionState({
    status: "completed",
    phase: "helper_enrichment",
    users: latestUsers,
    summary: latestSummary,
    progress: lastProgress,
    stopReason: result.reason,
    error: null,
    canResume: false,
    resumeHint: null
  }).catch(() => {});

  const enrichment = await chrome.runtime
    .sendMessage({ action: "FOLLOWGRAPH_START_ENRICHMENT", limit: 0 })
    .catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : "Activity enrichment could not start."
    }));

  if (enrichment?.ok) {
    await saveSessionState({
      status: "completed",
      phase: "helper_enrichment",
      users: latestUsers,
      summary: latestSummary,
      progress: lastProgress,
      stopReason: result.reason,
      error: null,
      canResume: false,
      resumeHint: null
    }).catch(() => {});
    uiSetStatus("Scan complete. Activity enrichment is running in a helper tab.");
    return;
  }

  await saveSessionState({
    status: "completed",
    phase: "completed",
    users: latestUsers,
    summary: latestSummary,
    progress: lastProgress,
    stopReason: result.reason,
    error: enrichment?.message || "Activity enrichment could not start.",
    canResume: false,
    resumeHint: null
  }).catch(() => {});
  uiSetStatus(`Scan complete. ${enrichment?.message || "Activity enrichment could not start."}`);
}

function registerRuntimeListener() {
  if (window.__FOLLOWGRAPH_LISTENER_READY__) return;
  window.__FOLLOWGRAPH_LISTENER_READY__ = true;

  chrome.runtime.onMessage.addListener((msg: { action?: string; username?: string; restId?: string | null; tabId?: number | null }, _sender: unknown, sendResponse: (value?: unknown) => void) => {
    if (msg?.action === "FOLLOWGRAPH_CANCEL_SCAN") {
      window.__FOLLOWGRAPH_SCAN_ABORT__ = true;
      ensureUI();
      uiSetStatus("Pausing scan...");
      sendResponse({ ok: true, message: "Pausing scan." });
      return true;
    }

    if (msg?.action === "FOLLOWGRAPH_START" || msg?.action === "FOLLOWGRAPH_START_SCAN" || msg?.action === "FOLLOWGRAPH_RESUME_SCAN") {
      if (window.__FOLLOWGRAPH_RUNNING__) {
        ensureUI();
        uiSetStatus("Already running.");
        sendResponse({ ok: false, message: "Already running." });
        return true;
      }

      window.__FOLLOWGRAPH_RUNNING__ = true;
      sendResponse({ ok: true, message: "Started." });

      void runScan(msg.action === "FOLLOWGRAPH_RESUME_SCAN" ? "resume" : "start", msg.tabId ?? null)
        .catch((error) => {
          console.error(error);
          ensureUI();
          uiSetStatus("Error. See console.");
          void loadScanSession()
            .then((session) => {
              if (!session || session.id !== window.__FOLLOWGRAPH_CURRENT_SESSION_ID__) return;
              return saveScanSession({
                ...session,
                status: "recoverable_error",
                error: error instanceof Error ? error.message : "Scan failed.",
                canResume: true,
                resumeHint: "Fix X if needed, then click Resume scan."
              });
            })
            .catch(() => {});
        })
        .finally(() => {
          window.__FOLLOWGRAPH_RUNNING__ = false;
        });

      return true;
    }

    if (msg?.action === "FOLLOWGRAPH_GET_PROFILE_ACTIVITY") {
      void extractProfileActivity({ username: msg.username || "", restId: msg.restId ?? null })
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error(error);
          sendResponse({
            username: msg.username || "",
            lastActivityISO: null,
            activitySource: "none",
            profileState: "unknown",
            note: error instanceof Error ? error.message : "Profile activity extraction failed."
          });
        });
      return true;
    }

    if (msg?.action === "FOLLOWGRAPH_UNFOLLOW_CURRENT_PROFILE") {
      void unfollowCurrentProfile(msg.username)
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error(error);
          sendResponse({
            username: msg.username || "",
            status: "failed",
            note: error instanceof Error ? error.message : "Unfollow failed."
          });
        });
      return true;
    }

    return;
  });
}

registerRuntimeListener();
registerStorageSync();
