import type {
  ClassifiedUser,
  JobState,
  JobType,
  JobWorkerState,
  PerformanceTelemetry,
  ProfileActivityResult,
  QueuedUser,
  ScanSession,
  ScanSummary,
  UnfollowAuditEntry,
  UnfollowResult,
  UnfollowResultStatus
} from "./types";
import { classifyUsers, summarize } from "./activity";
import { scanSessionBlocksJobs, scanSessionCanBeFinalized } from "./sessionRecovery";
import { appendUnfollowAudit, loadJobState, loadLastScan, loadScanSession, saveJobState, saveLastScan, saveScanSession } from "./storage";

const ENRICHMENT_DEFAULT_WORKERS = 8;
const ENRICHMENT_MAX_WORKERS = 12;
const ENRICHMENT_FLUSH_BATCH_SIZE = 100;
const SCAN_SESSION_STALE_MS = 45_000;
const ENRICHMENT_UNKNOWN_RETRY_LIMIT = 1;

type LastScanCache = {
  users: ClassifiedUser[];
  summary: ScanSummary;
  timestamp: number;
  indexByUsername: Map<string, number>;
  dirtyCount: number;
  performance?: PerformanceTelemetry;
};

let lastScanCache: LastScanCache | null = null;
let serializedJobOperation: Promise<unknown> = Promise.resolve();

function runSerialized<T>(operation: () => Promise<T>) {
  const next = serializedJobOperation.then(operation, operation);
  serializedJobOperation = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadNormalizedScanSession() {
  const session = await loadScanSession();
  if (!session) return null;

  if (session.status !== "running" || Date.now() - session.updatedAt <= SCAN_SESSION_STALE_MS) {
    return session;
  }

  const next: ScanSession = {
    ...session,
    status: "recoverable_error",
    stopReason: session.stopReason ?? "networkStall",
    error: session.error ?? "The previous scan stopped updating before it could finish.",
    canResume: true,
    resumeHint: session.resumeHint ?? "Open the saved /following page, then click Resume scan."
  };

  await saveScanSession(next);
  return next;
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
    restId: user.restId ?? null,
    username: user.username,
    displayName: user.displayName,
    profileUrl: user.profileUrl,
    attempts: 0
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

function resolveWorkerCount(type: JobType, total: number) {
  if (type === "unfollow") return Math.min(total, 1);
  if (total <= 0) return 1;
  const preferred = total >= 1_500 ? ENRICHMENT_MAX_WORKERS : ENRICHMENT_DEFAULT_WORKERS;
  return clamp(Math.min(total, preferred), 1, ENRICHMENT_MAX_WORKERS);
}

function buildLastScanCache(last: Awaited<ReturnType<typeof loadLastScan>>): LastScanCache | null {
  if (!last) return null;

  return {
    users: last.users.map((user) => ({ ...user })),
    summary: last.summary,
    timestamp: last.timestamp,
    indexByUsername: new Map(last.users.map((user, index) => [normalizeUsername(user.username), index])),
    dirtyCount: 0,
    performance: last.report?.performance
  };
}

async function ensureLastScanCache(refresh = false) {
  if (!refresh && lastScanCache) return lastScanCache;
  lastScanCache = buildLastScanCache(await loadLastScan());
  return lastScanCache;
}

async function flushLastScanCache(force = false) {
  const cache = await ensureLastScanCache();
  if (!cache) return;
  if (!force && cache.dirtyCount < ENRICHMENT_FLUSH_BATCH_SIZE) return;

  cache.summary = summarize(cache.users);
  await saveLastScan(cache.users, cache.summary, cache.timestamp, cache.performance);
  cache.dirtyCount = 0;
}

function captureHelperTelemetry(job: JobState) {
  if (job.type !== "enrich" || !lastScanCache) return;

  lastScanCache.performance = {
    ...lastScanCache.performance,
    helper: {
      completed: job.completed,
      succeeded: job.succeeded,
      failed: job.failed,
      workers: job.concurrency ?? ensureWorkers(job).length,
      profilesPerMinute: job.telemetry?.profilesPerMinute ?? 0
    }
  };
}

async function updateCachedUser(
  queueUser: QueuedUser,
  updater: (user: ClassifiedUser, now: number) => ClassifiedUser | Omit<ClassifiedUser, "category" | "daysSince" | "inactiveOver30">
) {
  let cache = await ensureLastScanCache();
  if (!cache) return null;

  const key = normalizeUsername(queueUser.username);
  let index = cache.indexByUsername.get(key);
  if (index === undefined) {
    cache = await ensureLastScanCache(true);
    index = cache?.indexByUsername.get(key);
  }

  if (cache == null || index === undefined) return null;

  const now = Date.now();
  const next = classifyUsers([updater(cache.users[index], now)], now)[0];
  cache.users[index] = next;
  cache.timestamp = now;
  cache.dirtyCount += 1;
  return next;
}

function ensureWorkers(job: JobState) {
  if (job.workers?.length) return job.workers;

  const workers: JobWorkerState[] = job.helperTabId
    ? [
        {
          tabId: job.helperTabId,
          phase: job.phase,
          currentUser: job.currentUser,
          updatedAt: job.updatedAt,
          note: null
        }
      ]
    : [];

  job.workers = workers;
  job.helperTabIds = workers.map((worker) => worker.tabId);
  job.concurrency = workers.length || job.concurrency || 1;
  return workers;
}

function syncLegacyJobFields(job: JobState) {
  const workers = ensureWorkers(job);
  const active = workers.find((worker) => worker.currentUser) ?? workers[0] ?? null;

  job.helperTabIds = workers.map((worker) => worker.tabId);
  job.helperTabId = active?.tabId ?? null;
  job.currentUser = active?.currentUser ?? null;
  job.phase = active?.phase ?? null;
  job.concurrency = workers.length || job.concurrency || 1;

  return job;
}

async function persistJob(job: JobState | null) {
  if (!job) {
    await saveJobState(null);
    return;
  }

  captureHelperTelemetry(job);
  job.updatedAt = Date.now();
  await saveJobState(syncLegacyJobFields(job));
}

function findWorker(job: JobState, tabId: number) {
  return ensureWorkers(job).find((worker) => worker.tabId === tabId) || null;
}

function activeWorkerCount(job: JobState) {
  return ensureWorkers(job).filter((worker) => worker.currentUser).length;
}

function updateJobTelemetry(job: JobState, result: ProfileActivityResult) {
  job.telemetry = job.telemetry ?? {};
  if (result.activitySource === "apiTimeline") {
    job.telemetry.apiResolved = (job.telemetry.apiResolved ?? 0) + 1;
  } else if (result.profileState !== "unknown") {
    job.telemetry.domResolved = (job.telemetry.domResolved ?? 0) + 1;
  } else {
    job.telemetry.failed = (job.telemetry.failed ?? 0) + 1;
  }

  job.telemetry.profilesPerMinute = (job.completed + 1) / Math.max((Date.now() - job.startedAt) / 60000, 1 / 60);
}

function helperTabIds(job: JobState) {
  return ensureWorkers(job).map((worker) => worker.tabId);
}

async function ensureHelperTab() {
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (!tab?.id) throw new Error("Could not create helper tab.");
  return tab.id as number;
}

async function closeHelperTabs(tabIds: number[]) {
  if (tabIds.length === 0) return;
  try {
    await chrome.tabs.remove(tabIds);
  } catch {}
}

async function navigateHelperTab(tabId: number, url: string) {
  await chrome.tabs.update(tabId, { url });
}

function sameQueuedUser(a: QueuedUser | null, b: QueuedUser) {
  return Boolean(a && normalizeUsername(a.username) === normalizeUsername(b.username));
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
  const tabIds = helperTabIds(job);
  const nextJob: JobState = {
    ...job,
    status,
    phase: null,
    helperTabId: null,
    helperTabIds: [],
    currentUser: null,
    workers: [],
    updatedAt: Date.now(),
    message
  };

  await flushLastScanCache(true);
  await persistJob(nextJob);
  await closeHelperTabs(tabIds);
  return nextJob;
}

function enrichmentOutcome(result: ProfileActivityResult): UnfollowResultStatus {
  return result.profileState === "unknown" ? "failed" : "success";
}

async function persistActivityResult(queueUser: QueuedUser, result: ProfileActivityResult) {
  await updateCachedUser(queueUser, (user, now) => ({
    ...user,
    restId: result.restId ?? user.restId ?? queueUser.restId ?? null,
    lastActivityISO: result.lastActivityISO,
    activitySource: result.activitySource,
    profileState: result.profileState,
    enrichmentStatus: result.profileState === "unknown" ? "failed" : "done",
    lastCheckedAt: now,
    note: result.note,
    unfollowedAt: user.unfollowedAt ?? null
  }));
}

async function persistUnfollowResult(queueUser: QueuedUser, result: UnfollowResult) {
  const updated = await updateCachedUser(queueUser, (user, now) => ({
    ...user,
    note: result.note,
    unfollowedAt: result.status === "success" ? now : user.unfollowedAt ?? null
  }));

  const auditEntry: UnfollowAuditEntry = {
    username: queueUser.username,
    displayName: queueUser.displayName,
    timestamp: Date.now(),
    status: result.status,
    note: result.note,
    daysSince: updated?.daysSince ?? null
  };

  await appendUnfollowAudit([auditEntry]);
}

async function handOffWorkerToNavigation(job: JobState, tabId: number, note: string) {
  const worker = findWorker(job, tabId);
  if (!worker?.currentUser) return;

  worker.phase = "awaiting_navigation";
  worker.note = note;
  worker.updatedAt = Date.now();
  job.message = `API relay could not resolve @${worker.currentUser.username}. Checking its profile page...`;
  await persistJob(job);
  await navigateHelperTab(tabId, worker.currentUser.profileUrl);
}

function scheduleApiRelay(jobId: string, tabId: number) {
  void (async () => {
    const context = await runSerialized(async () => {
      const job = await loadJobState();
      if (!job || job.id !== jobId || job.status !== "running" || job.type !== "enrich") return null;

      const worker = findWorker(job, tabId);
      if (!worker?.currentUser || worker.phase !== "api_processing") return null;
      return { currentUser: worker.currentUser };
    });

    if (!context) return;

    try {
      // The scanner stays injected after the bootstrap profile. This is an idempotent recovery for suspended tabs.
      await chrome.scripting.executeScript({ target: { tabId }, files: ["scanner.js"] });
      const result = (await chrome.tabs.sendMessage(tabId, {
        action: "FOLLOWGRAPH_GET_PROFILE_ACTIVITY_API_ONLY",
        username: context.currentUser.username,
        restId: context.currentUser.restId ?? null
      })) as ProfileActivityResult | null;

      await runSerialized(async () => {
        const job = await loadJobState();
        if (!job || job.id !== jobId || job.status !== "running" || job.type !== "enrich") return;

        const worker = findWorker(job, tabId);
        if (!worker || worker.phase !== "api_processing" || !sameQueuedUser(worker.currentUser, context.currentUser)) return;

        if (!result || result.profileState === "unknown") {
          await handOffWorkerToNavigation(job, tabId, "No activity result from the API relay.");
          return;
        }

        updateJobTelemetry(job, result);
        await persistActivityResult(context.currentUser, result);
        await advanceWorker(job, tabId, enrichmentOutcome(result), result.note || "Resolved through the API relay.");
      });
    } catch (error) {
      await runSerialized(async () => {
        const job = await loadJobState();
        if (!job || job.id !== jobId || job.status !== "running" || job.type !== "enrich") return;

        const worker = findWorker(job, tabId);
        if (!worker || worker.phase !== "api_processing" || !sameQueuedUser(worker.currentUser, context.currentUser)) return;
        const note = error instanceof Error ? error.message : "API relay failed.";
        await handOffWorkerToNavigation(job, tabId, note);
      });
    }
  })();
}

async function advanceWorker(job: JobState, tabId: number, status: UnfollowResultStatus, note: string) {
  const worker = findWorker(job, tabId);
  if (!worker) return job;

  job.completed += 1;
  if (status === "success") job.succeeded += 1;
  if (status === "failed") job.failed += 1;
  if (status === "skipped" || status === "already_not_following") job.skipped += 1;

  worker.note = note;
  worker.updatedAt = Date.now();

  const nextUser = job.queue.shift() || null;
  if (nextUser) {
    worker.currentUser = nextUser;
    const useApiRelay = job.type === "enrich" && worker.apiReady;
    worker.phase = useApiRelay ? "api_processing" : "awaiting_navigation";
    job.message = useApiRelay
      ? `Resolving @${nextUser.username} through the API relay. ${note}`
      : `${job.type === "enrich" ? "Opening" : "Reviewing"} @${nextUser.username}. ${note}`;

    await flushLastScanCache(false);
    await persistJob(job);
    if (useApiRelay) {
      scheduleApiRelay(job.id, worker.tabId);
    } else {
      await navigateHelperTab(worker.tabId, nextUser.profileUrl);
    }
    return job;
  }

  worker.currentUser = null;
  worker.phase = null;

  const remainingWorkers = activeWorkerCount(job);
  if (remainingWorkers === 0) {
    return finalizeJob(
      job,
      "completed",
      `${job.type === "enrich" ? "Enrichment" : "Unfollow"} complete. ${job.completed}/${job.total} processed using ${job.concurrency || 1} worker${job.concurrency === 1 ? "" : "s"}.`
    );
  }

  job.message = `${job.type === "enrich" ? "Enrichment" : "Unfollow"} running. ${job.completed}/${job.total} processed. ${remainingWorkers} worker${remainingWorkers === 1 ? "" : "s"} still active. ${note}`;

  await flushLastScanCache(false);
  await persistJob(job);
  return job;
}

async function retryCurrentEnrichmentUser(job: JobState, tabId: number, currentUser: QueuedUser, note: string) {
  const worker = findWorker(job, tabId);
  if (!worker) return job;

  job.queue.push({
    ...currentUser,
    attempts: (currentUser.attempts ?? 0) + 1
  });

  worker.note = note;
  worker.updatedAt = Date.now();

  const nextUser = job.queue.shift() || null;
  if (nextUser) {
    worker.currentUser = nextUser;
    const useApiRelay = Boolean(worker.apiReady);
    worker.phase = useApiRelay ? "api_processing" : "awaiting_navigation";
    job.message = useApiRelay
      ? `Retrying unresolved profile through the API relay: @${nextUser.username}. ${note}`
      : `Retrying unresolved profile later. Opening @${nextUser.username}. ${note}`;
    await persistJob(job);
    if (useApiRelay) {
      scheduleApiRelay(job.id, worker.tabId);
    } else {
      await navigateHelperTab(worker.tabId, nextUser.profileUrl);
    }
    return job;
  }

  worker.currentUser = null;
  worker.phase = null;
  await persistJob(job);
  return job;
}

async function continueJobAfterFailure(job: JobState, tabId: number, error: unknown) {
  const note = error instanceof Error ? error.message : "Job step failed.";
  const worker = findWorker(job, tabId);
  if (!worker?.currentUser) {
    await finalizeJob(job, "error", note);
    return;
  }

  if (job.type === "enrich") {
    worker.apiReady = true;
    await persistActivityResult(worker.currentUser, {
      username: worker.currentUser.username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unknown",
      note
    });
  } else {
    await persistUnfollowResult(worker.currentUser, {
      username: worker.currentUser.username,
      status: "failed",
      note
    });
  }

  await advanceWorker(job, tabId, "failed", note);
}

async function beginProcessWorker(
  job: JobState,
  tabId: number
): Promise<{ jobType: JobType; currentUser: QueuedUser } | null> {
  const worker = findWorker(job, tabId);
  if (!worker?.currentUser) return null;

  worker.phase = "processing";
  worker.updatedAt = Date.now();

  const activeWorkers = activeWorkerCount(job);
  job.message = `${job.type === "enrich" ? "Checking" : "Reviewing"} @${worker.currentUser.username} (${job.completed + 1}/${job.total}) across ${activeWorkers} worker${activeWorkers === 1 ? "" : "s"}.`;

  await persistJob(job);
  return { jobType: job.type, currentUser: worker.currentUser };
}

async function completeProcessWorker(
  tabId: number,
  jobType: JobType,
  currentUser: QueuedUser,
  result: ProfileActivityResult | UnfollowResult
): Promise<void> {
  const job = await loadJobState();
  if (!job || job.status !== "running") return;

  if (jobType === "enrich") {
    const r = result as ProfileActivityResult;
    const worker = findWorker(job, tabId);
    if (worker) worker.apiReady = true;
    if (r.profileState === "unknown" && (currentUser.attempts ?? 0) < ENRICHMENT_UNKNOWN_RETRY_LIMIT) {
      await retryCurrentEnrichmentUser(
        job,
        tabId,
        currentUser,
        r.note ? `${r.note} Retrying once after other profiles.` : "Profile unresolved. Retrying once after other profiles."
      );
      return;
    }

    updateJobTelemetry(job, r);
    await persistActivityResult(currentUser, r);
    await advanceWorker(job, tabId, enrichmentOutcome(r), r.note || "Activity checked.");
  } else {
    const r = result as UnfollowResult;
    await persistUnfollowResult(currentUser, r);
    await advanceWorker(job, tabId, r.status, r.note);
  }
}

async function failProcessWorker(
  tabId: number,
  jobType: JobType,
  currentUser: QueuedUser,
  error: unknown
): Promise<void> {
  const job = await loadJobState();
  if (!job || job.status !== "running") return;

  const note = error instanceof Error ? error.message : "Job step failed.";

  if (jobType === "enrich") {
    const worker = findWorker(job, tabId);
    if (worker) worker.apiReady = true;
    await persistActivityResult(currentUser, {
      username: currentUser.username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unknown",
      note
    });
  } else {
    await persistUnfollowResult(currentUser, {
      username: currentUser.username,
      status: "failed",
      note
    });
  }

  await advanceWorker(job, tabId, "failed", note);
}

async function startJob(type: JobType, queue: QueuedUser[], thresholdMessage: string) {
  const workerCount = resolveWorkerCount(type, queue.length);
  const tabIds = await Promise.all(Array.from({ length: workerCount }, () => ensureHelperTab()));
  const workers = tabIds.map<JobWorkerState>((tabId) => ({
    tabId,
    phase: null,
    currentUser: null,
    updatedAt: Date.now(),
    note: null
  }));

  const pending = [...queue];
  const initialTargets: Array<{ tabId: number; url: string }> = [];

  for (const worker of workers) {
    const nextUser = pending.shift();
    if (!nextUser) break;
    worker.currentUser = nextUser;
    worker.phase = "awaiting_navigation";
    initialTargets.push({ tabId: worker.tabId, url: nextUser.profileUrl });
  }

  const job: JobState = {
    id: createId(),
    type,
    status: "running",
    phase: null,
    helperTabId: null,
    helperTabIds: [],
    currentUser: null,
    workers,
    queue: pending,
    total: queue.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    message: thresholdMessage,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    thresholdDays: 30,
    batchLimit: queue.length,
    concurrency: workers.length,
    telemetry: {
      apiResolved: 0,
      domResolved: 0,
      failed: 0,
      rateLimited: 0,
      profilesPerMinute: 0
    }
  };

  await persistJob(job);
  await Promise.all(initialTargets.map((target) => navigateHelperTab(target.tabId, target.url)));
  return job;
}

async function startEnrichment(limit?: number) {
  const existing = await loadJobState();
  if (existing?.status === "running") {
    return { ok: false, message: "A job is already running." };
  }

  let scanSession = await loadNormalizedScanSession();
  if (scanSessionBlocksJobs(scanSession) && scanSessionCanBeFinalized(scanSession)) {
    const finalized = await finalizeScanSession();
    if (!finalized.ok) return finalized;
    scanSession = await loadNormalizedScanSession();
  }

  if (scanSession?.status === "running") {
    return { ok: false, message: "A scan is still running. Finish or pause it before enrichment." };
  }
  if (scanSession?.status === "recoverable_error" || scanSession?.status === "paused") {
    return { ok: false, message: "Resume or cancel the incomplete scan before enrichment." };
  }

  const last = await loadLastScan();
  if (!last?.users.length) {
    return { ok: false, message: "Run a following scan first." };
  }

  lastScanCache = buildLastScanCache(last);

  const effectiveLimit = resolveEnrichmentLimit(limit, last.users.length);
  const queue = buildEnrichmentQueue(last.users, effectiveLimit);
  if (queue.length === 0) {
    return { ok: false, message: "No profiles require enrichment." };
  }

  const concurrency = resolveWorkerCount("enrich", queue.length);
  await startJob(
    "enrich",
    queue,
    `Opening ${Math.min(concurrency, queue.length)} helper tabs to bootstrap the API relay for ${queue.length} activity checks.`
  );

  return {
    ok: true,
    message:
      effectiveLimit >= last.users.length
        ? `Resolving activity for all ${queue.length} accounts through ${concurrency} API relay helpers.`
        : `Resolving activity for ${queue.length} accounts through ${concurrency} API relay helpers.`
  };
}

async function finalizeScanSession() {
  const session = await loadNormalizedScanSession();
  if (!scanSessionCanBeFinalized(session)) {
    return { ok: false, message: "No saved scan checkpoint can be finished." };
  }

  const now = Date.now();
  const users = classifyUsers(session!.users, now);
  const summary = summarize(users);
  await saveLastScan(users, summary, now);
  await saveScanSession({
    ...session!,
    status: "completed",
    phase: "completed",
    users,
    summary,
    stopReason: "idle",
    error: null,
    canResume: false,
    resumeHint: null,
    updatedAt: now
  });

  lastScanCache = buildLastScanCache(await loadLastScan());

  return {
    ok: true,
    message: `Saved scan finished with ${summary.total} profiles. You can start enrichment now.`,
    summary
  };
}

async function startUnfollow(usernames: string[], limit: number) {
  const existing = await loadJobState();
  if (existing?.status === "running") {
    return { ok: false, message: "A job is already running." };
  }

  const scanSession = await loadNormalizedScanSession();
  if (scanSessionBlocksJobs(scanSession)) {
    return { ok: false, message: "Finish, resume, or clear the incomplete scan before unfollow review." };
  }

  const last = await loadLastScan();
  if (!last?.users.length) {
    return { ok: false, message: "Run and enrich a scan first." };
  }

  lastScanCache = buildLastScanCache(last);

  const queue = buildUnfollowQueue(last.users, usernames, clamp(limit || 25, 1, 50));
  if (queue.length === 0) {
    return { ok: false, message: "Only enriched accounts inactive for more than 30 days can be unfollowed." };
  }

  await startJob("unfollow", queue, `Starting unfollow review for ${queue.length} accounts.`);
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
          return runSerialized(() => startEnrichment(msg.limit));
        case "FOLLOWGRAPH_FINALIZE_SCAN_SESSION":
          return runSerialized(() => finalizeScanSession());
        case "FOLLOWGRAPH_START_UNFOLLOW":
          return runSerialized(() => startUnfollow(msg.usernames || [], msg.limit || 25));
        case "FOLLOWGRAPH_CANCEL_JOB":
          return runSerialized(() => cancelJob());
        case "FOLLOWGRAPH_GET_JOB_STATE":
          return loadJobState();
        case "FOLLOWGRAPH_GET_SCAN_SESSION":
          return loadNormalizedScanSession();
        case "FOLLOWGRAPH_CLEAR_SCAN_SESSION":
          return runSerialized(async () => {
            const session = await loadNormalizedScanSession();
            if (session?.status === "running") return { ok: false, message: "Pause the running scan before clearing it." };
            await saveScanSession(null);
            return { ok: true, message: "Scan session cleared." };
          });
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
    // Phase 1 (serialized, fast): validate state and transition worker to "processing"
    const context = await runSerialized(async () => {
      const job = await loadJobState();
      if (!job || job.status !== "running") return null;

      const worker = findWorker(job, tabId);
      if (!worker || worker.phase !== "awaiting_navigation") return null;
      if (!(await helperTabMatchesCurrentUser(tabId, worker.currentUser))) return null;

      return beginProcessWorker(job, tabId);
    });

    if (!context) return;

    // Phase 2 (NOT serialized, slow): inject scanner and extract profile data
    // Multiple workers execute this phase concurrently.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["scanner.js"] });

      let result: ProfileActivityResult | UnfollowResult;
      if (context.jobType === "enrich") {
        result = (await chrome.tabs.sendMessage(tabId, {
          action: "FOLLOWGRAPH_GET_PROFILE_ACTIVITY",
          username: context.currentUser.username,
          restId: context.currentUser.restId ?? null
        })) as ProfileActivityResult;
      } else {
        result = (await chrome.tabs.sendMessage(tabId, {
          action: "FOLLOWGRAPH_UNFOLLOW_CURRENT_PROFILE",
          username: context.currentUser.username
        })) as UnfollowResult;
      }

      // Phase 3 (serialized, fast): persist result and advance worker
      await runSerialized(() => completeProcessWorker(tabId, context.jobType, context.currentUser, result));
    } catch (error) {
      // Phase 3 error path (serialized, fast)
      await runSerialized(() => failProcessWorker(tabId, context.jobType, context.currentUser, error));
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  void runSerialized(async () => {
    const job = await loadJobState();
    if (!job || job.status !== "running") return;

    const workers = ensureWorkers(job);
    const index = workers.findIndex((worker) => worker.tabId === tabId);
    if (index === -1) return;

    const [removedWorker] = workers.splice(index, 1);
    job.concurrency = workers.length || job.concurrency || 1;

    if (removedWorker.currentUser) {
      const note = `${job.type === "enrich" ? "Enrichment" : "Unfollow"} helper tab was closed while processing @${removedWorker.currentUser.username}.`;
      if (job.type === "enrich") {
        await persistActivityResult(removedWorker.currentUser, {
          username: removedWorker.currentUser.username,
          lastActivityISO: null,
          activitySource: "none",
          profileState: "unknown",
          note
        });
      } else {
        await persistUnfollowResult(removedWorker.currentUser, {
          username: removedWorker.currentUser.username,
          status: "failed",
          note
        });
      }

      job.completed += 1;
      job.failed += 1;
    }

    if (workers.length === 0) {
      await finalizeJob(
        job,
        "error",
        `${job.type === "enrich" ? "Enrichment" : "Unfollow"} stopped because all helper tabs were closed.`
      );
      return;
    }

    job.message = `${job.type === "enrich" ? "Enrichment" : "Unfollow"} continuing with ${workers.length} helper tab${workers.length === 1 ? "" : "s"}.`;
    await flushLastScanCache(false);
    await persistJob(job);
  });
});
