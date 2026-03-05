import type { LastScan, Progress, ScanSummary } from "./types";
import { classifyUsers, summarize } from "./activity";
import { parseVisibleUsers } from "./parser";
import { extractProfileActivity, unfollowCurrentProfile } from "./profile";
import { UserStore } from "./store";
import { runScrollLoop } from "./scroller";
import { ensureUI, uiEnableExport, uiSetFinalStatus, uiSetStatus, uiSetSummary, uiUpdateProgress } from "./ui";
import { LAST_SCAN_KEY, saveLastScan } from "./storage";

declare global {
  interface Window {
    __FOLLOWGRAPH_RUNNING__?: boolean;
    __FOLLOWGRAPH_LISTENER_READY__?: boolean;
    __FOLLOWGRAPH_STORAGE_SYNC_READY__?: boolean;
    __FOLLOWGRAPH_SCAN_COMPLETE__?: boolean;
  }
}

function isFollowingPage(): boolean {
  const hostOk = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(location.hostname);
  const pathOk = location.pathname.includes("/following");
  return hostOk && pathOk;
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

async function runScan() {
  if (!isFollowingPage()) {
    ensureUI();
    uiSetStatus("Open a /following page first.");
    return;
  }

  window.__FOLLOWGRAPH_SCAN_COMPLETE__ = false;
  ensureUI();
  uiSetStatus("Scanning...");

  const store = new UserStore();
  let extractedTotal = 0;

  const result = await runScrollLoop({
    onTick: (tick) => {
      const visible = parseVisibleUsers();
      store.add(visible);
      extractedTotal = store.size();

      const progress: Progress = {
        ...tick,
        extractedTotal
      };

      uiUpdateProgress(progress);
      uiSetStatus(tick.progressed ? "Scanning..." : "Scanning (waiting for load)...");
    }
  });

  uiSetFinalStatus(result.reason);

  const users = classifyUsers(store.values());
  const summary: ScanSummary = summarize(users);

  uiSetSummary(summary);
  uiEnableExport(users);

  await saveLastScan(users, summary).catch(() => {});
  window.__FOLLOWGRAPH_SCAN_COMPLETE__ = true;

  uiSetStatus("Scan complete. Starting activity enrichment...");

  const enrichment = await chrome.runtime
    .sendMessage({ action: "FOLLOWGRAPH_START_ENRICHMENT", limit: 0 })
    .catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : "Activity enrichment could not start."
    }));

  if (enrichment?.ok) {
    uiSetStatus("Scan complete. Activity enrichment is running in a helper tab.");
    return;
  }

  uiSetStatus(`Scan complete. ${enrichment?.message || "Activity enrichment could not start."}`);
}

function registerRuntimeListener() {
  if (window.__FOLLOWGRAPH_LISTENER_READY__) return;
  window.__FOLLOWGRAPH_LISTENER_READY__ = true;

  chrome.runtime.onMessage.addListener((msg: { action?: string; username?: string }, _sender: unknown, sendResponse: (value?: unknown) => void) => {
    if (msg?.action === "FOLLOWGRAPH_START") {
      if (window.__FOLLOWGRAPH_RUNNING__) {
        ensureUI();
        uiSetStatus("Already running.");
        sendResponse({ ok: false, message: "Already running." });
        return true;
      }

      window.__FOLLOWGRAPH_RUNNING__ = true;
      sendResponse({ ok: true, message: "Started." });

      void runScan()
        .catch((error) => {
          console.error(error);
          ensureUI();
          uiSetStatus("Error. See console.");
        })
        .finally(() => {
          window.__FOLLOWGRAPH_RUNNING__ = false;
        });

      return true;
    }

    if (msg?.action === "FOLLOWGRAPH_GET_PROFILE_ACTIVITY") {
      void extractProfileActivity(msg.username)
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
