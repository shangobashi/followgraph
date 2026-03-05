import type {
  ClassifiedUser,
  JobState,
  ProfileActivityResult,
  QueuedUser,
  UnfollowAuditEntry,
  UnfollowResult,
  UnfollowResultStatus
} from "./types";
import { classifyUsers, summarize } from "./activity";
import { appendUnfollowAudit, loadJobState, loadLastScan, saveJobState, saveLastScan } from "./storage";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUsername(username: string) {
  return username.replace(/^@/, "").trim().toLowerCase();
}

function usernameFromUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    return normalizeUsername(url.pathname.split("/").filter(Boolean)[0] || "");
  } catch {
    return "";
  }
}

function queueFromUsers(users: ClassifiedUser[]) {
  return users.map<QueuedUser>((user) => ({
    username: user.username,
    displayName: user.displayName,
    profileUrl: user.profileUrl
  }));
}

function isResolvedActivityState(user: ClassifiedUser) {
  return user.enrichmentStatus === "done" && user.profileState !== "unknown";
}

function buildEnrichmentQueue(users: ClassifiedUser[], limit: number) {
  const unresolved = users.filter((user) => !isResolvedActivityState(user));
  const source = unresolved.length > 0 ? unresolved : users.filter((user) => !user.unfollowedAt);
  return queueFromUsers(source.filter((user) => !user.unfollowedAt).slice(0, limit));
}

function buildUnfollowQueue(users: ClassifiedUser[], usernames: string[], limit: number) {
  const set = new Set(usernames.map((username) => normalizeUsername(username)));
  return queueFromUsers(
    users
      .filter(
        (user) =>
          set.has(normalizeUsername(user.username)) &&
          isResolvedActivityState(user) &&
          user.inactiveOver30 &&
          !user.unfollowedAt
      )
      .slice(0, limit)
  );
}

function resolveEnrichmentLimit(requestedLimit: number | undefined, totalUsers: number) {
  const parsed = typeof requestedLimit === "number" && Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 0;
  if (parsed <= 0) return Math.max(totalUsers, 1);
  return clamp(parsed, 1, Math.max(totalUsers, 1));
}

async function ensureHelperTab() {
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (!tab?.id) throw new Error("Could not create helper tab.");
  return tab.id as number;
}

async function closeHelperTab(tabId: number | null) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {}
}

async function navigateHelperTab(tabId: number, url: string) {
  await chrome.tabs.update(tabId, { url });
}

async function helperTabMatchesCurrentUser(tabId: number, currentUser: QueuedUser | null) {
  if (!currentUser) return false;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) return false;
    return usernameFromUrl(tab.url) === normalizeUsername(currentUser.username);
  } catch {
    return false;
  }
}

async function finalizeJob(job: JobState, status: JobState["status"], message: string) {
  const helperTabId = job.helperTabId;
  const nextJob: JobState = {
    ...job,
    status,
    phase: null,
    helperTabId: null,
    currentUser: null,
    updatedAt: Date.now(),
    message
  };

  await saveJobState(nextJob);
  await closeHelperTab(helperTabId);
  return nextJob;
}

function enrichmentOutcome(result: ProfileActivityResult): UnfollowResultStatus {
  return result.profileState === "unknown" ? "failed" : "success";
}

async function persistActivityResult(queueUser: QueuedUser, result: ProfileActivityResult) {
  const last = await loadLastScan();
  if (!last) return;

  const now = Date.now();
  const updated = classifyUsers(
    last.users.map((user) => {
      if (user.username !== queueUser.username) return user;

      return {
        ...user,
        lastActivityISO: result.lastActivityISO,
        activitySource: result.activitySource,
        profileState: result.profileState,
        enrichmentStatus: result.profileState === "unknown" ? "failed" : "done",
        lastCheckedAt: now,
        note: result.note,
        unfollowedAt: user.unfollowedAt ?? null
      };
    }),
    now
  );

  await saveLastScan(updated, summarize(updated), now);
}

async function persistUnfollowResult(queueUser: QueuedUser, result: UnfollowResult) {
  const last = await loadLastScan();
  if (!last) return;

  const now = Date.now();
  const updated = classifyUsers(
    last.users.map((user) => {
      if (user.username !== queueUser.username) return user;

      return {
        ...user,
        note: result.note,
        unfollowedAt: result.status === "success" ? now : user.unfollowedAt ?? null
      };
    }),
    now
  );

  await saveLastScan(updated, summarize(updated), now);

  const target = updated.find((user) => user.username === queueUser.username);
  const auditEntry: UnfollowAuditEntry = {
    username: queueUser.username,
    displayName: queueUser.displayName,
    timestamp: now,
    status: result.status,
    note: result.note,
    daysSince: target?.daysSince ?? null
  };

  await appendUnfollowAudit([auditEntry]);
}

async function advanceJob(job: JobState, status: UnfollowResultStatus, note: string) {
  const completed = job.completed + 1;
  const succeeded = job.succeeded + (status === "success" ? 1 : 0);
  const failed = job.failed + (status === "failed" ? 1 : 0);
  const skipped = job.skipped + (status === "skipped" || status === "already_not_following" ? 1 : 0);

  if (job.queue.length === 0) {
    return finalizeJob(
      {
        ...job,
        completed,
        succeeded,
        failed,
        skipped
      },
      "completed",
      `${job.type === "enrich" ? "Enrichment" : "Unfollow"} complete. ${completed}/${job.total} processed.`
    );
  }

  const [nextUser, ...rest] = job.queue;
  const nextJob: JobState = {
    ...job,
    phase: "awaiting_navigation",
    currentUser: nextUser,
    queue: rest,
    completed,
    succeeded,
    failed,
    skipped,
    updatedAt: Date.now(),
    message: `${job.type === "enrich" ? "Navigating to" : "Opening"} @${nextUser.username}. ${note}`
  };

  await saveJobState(nextJob);
  if (!job.helperTabId) throw new Error("Helper tab is no longer available.");
  await navigateHelperTab(job.helperTabId, nextUser.profileUrl);
  return nextJob;
}

async function continueJobAfterFailure(job: JobState, error: unknown) {
  const note = error instanceof Error ? error.message : "Job step failed.";
  if (!job.currentUser) {
    await finalizeJob(job, "error", note);
    return;
  }

  if (job.type === "enrich") {
    await persistActivityResult(job.currentUser, {
      username: job.currentUser.username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unknown",
      note
    });
  } else {
    await persistUnfollowResult(job.currentUser, {
      username: job.currentUser.username,
      status: "failed",
      note
    });
  }

  await advanceJob(job, "failed", note);
}

async function processJob(job: JobState) {
  if (!job.helperTabId || !job.currentUser) return;

  const processing: JobState = {
    ...job,
    phase: "processing",
    updatedAt: Date.now(),
    message: `${job.type === "enrich" ? "Checking" : "Reviewing"} @${job.currentUser.username}...`
  };

  await saveJobState(processing);
  await chrome.scripting.executeScript({ target: { tabId: job.helperTabId }, files: ["scanner.js"] });

  if (job.type === "enrich") {
    const result = (await chrome.tabs.sendMessage(job.helperTabId, {
      action: "FOLLOWGRAPH_GET_PROFILE_ACTIVITY",
      username: job.currentUser.username
    })) as ProfileActivityResult;

    await persistActivityResult(job.currentUser, result);
    await advanceJob(processing, enrichmentOutcome(result), result.note || "Activity checked.");
    return;
  }

  const unfollowResult = (await chrome.tabs.sendMessage(job.helperTabId, {
    action: "FOLLOWGRAPH_UNFOLLOW_CURRENT_PROFILE",
    username: job.currentUser.username
  })) as UnfollowResult;

  await persistUnfollowResult(job.currentUser, unfollowResult);
  await advanceJob(processing, unfollowResult.status, unfollowResult.note);
}

async function startEnrichment(limit?: number) {
  const existing = await loadJobState();
  if (existing?.status === "running") {
    return { ok: false, message: "A job is already running." };
  }

  const last = await loadLastScan();
  if (!last?.users.length) {
    return { ok: false, message: "Run a following scan first." };
  }

  const effectiveLimit = resolveEnrichmentLimit(limit, last.users.length);
  const queue = buildEnrichmentQueue(last.users, effectiveLimit);
  if (queue.length === 0) {
    return { ok: false, message: "No profiles require enrichment." };
  }

  const helperTabId = await ensureHelperTab();
  const [currentUser, ...rest] = queue;

  const job: JobState = {
    id: createId(),
    type: "enrich",
    status: "running",
    phase: "awaiting_navigation",
    helperTabId,
    currentUser,
    queue: rest,
    total: queue.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    message: `Opening @${currentUser.username}...`,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    thresholdDays: 30,
    batchLimit: queue.length
  };

  await saveJobState(job);
  await navigateHelperTab(helperTabId, currentUser.profileUrl);
  return {
    ok: true,
    message:
      effectiveLimit >= last.users.length
        ? `Resolving activity for all ${queue.length} accounts in a helper tab.`
        : `Resolving activity for ${queue.length} accounts in a helper tab.`
  };
}

async function startUnfollow(usernames: string[], limit: number) {
  const existing = await loadJobState();
  if (existing?.status === "running") {
    return { ok: false, message: "A job is already running." };
  }

  const last = await loadLastScan();
  if (!last?.users.length) {
    return { ok: false, message: "Run and enrich a scan first." };
  }

  const queue = buildUnfollowQueue(last.users, usernames, clamp(limit || 25, 1, 50));
  if (queue.length === 0) {
    return { ok: false, message: "Only enriched accounts inactive for more than 30 days can be unfollowed." };
  }

  const helperTabId = await ensureHelperTab();
  const [currentUser, ...rest] = queue;

  const job: JobState = {
    id: createId(),
    type: "unfollow",
    status: "running",
    phase: "awaiting_navigation",
    helperTabId,
    currentUser,
    queue: rest,
    total: queue.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    message: `Opening @${currentUser.username}...`,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    thresholdDays: 30,
    batchLimit: queue.length
  };

  await saveJobState(job);
  await navigateHelperTab(helperTabId, currentUser.profileUrl);
  return { ok: true, message: `Starting unfollow review for ${queue.length} accounts.` };
}

async function cancelJob() {
  const job = await loadJobState();
  if (!job || job.status !== "running") {
    return { ok: false, message: "No active job to stop." };
  }

  await finalizeJob(job, "cancelled", `${job.type === "enrich" ? "Enrichment" : "Unfollow"} cancelled.`);
  return { ok: true, message: "Job cancelled." };
}

chrome.runtime.onInstalled.addListener(() => {
  // intentionally minimal
});

chrome.runtime.onMessage.addListener(
  (
    msg: { action?: string; limit?: number; usernames?: string[] },
    _sender: unknown,
    sendResponse: (value?: unknown) => void
  ) => {
    if (!msg?.action) return;

    const handle = async () => {
      switch (msg.action) {
        case "FOLLOWGRAPH_START_ENRICHMENT":
          return startEnrichment(msg.limit);
        case "FOLLOWGRAPH_START_UNFOLLOW":
          return startUnfollow(msg.usernames || [], msg.limit || 25);
        case "FOLLOWGRAPH_CANCEL_JOB":
          return cancelJob();
        case "FOLLOWGRAPH_GET_JOB_STATE":
          return loadJobState();
        default:
          return { ok: false, message: "Unknown action." };
      }
    };

    void handle()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : "Background action failed." });
      });

    return true;
  }
);

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: { status?: string }) => {
  if (changeInfo.status !== "complete") return;

  void (async () => {
    const job = await loadJobState();
    if (!job || job.status !== "running" || job.helperTabId !== tabId || job.phase !== "awaiting_navigation") return;
    if (!(await helperTabMatchesCurrentUser(tabId, job.currentUser))) return;

    try {
      await processJob(job);
    } catch (error) {
      await continueJobAfterFailure(job, error);
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  void (async () => {
    const job = await loadJobState();
    if (!job || job.status !== "running" || job.helperTabId !== tabId) return;
    await finalizeJob(
      job,
      "error",
      `${job.type === "enrich" ? "Enrichment" : "Unfollow"} stopped because the helper tab was closed.`
    );
  })();
});
