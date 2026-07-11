import type { ClassifiedUser, JobState, LastScan, ScanSession } from "../types";
import { loadLastScan } from "../storage";
import { downloadCsv, downloadJson, toCSV } from "../exporter";

const statusEl = document.getElementById("status") as HTMLDivElement;
const jobStatusEl = document.getElementById("jobStatus") as HTMLDivElement;
const workflowStatusEl = document.getElementById("workflowStatus") as HTMLDivElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const pauseScanBtn = document.getElementById("pauseScanBtn") as HTMLButtonElement;
const enrichBtn = document.getElementById("enrichBtn") as HTMLButtonElement;
const clearScanBtn = document.getElementById("clearScanBtn") as HTMLButtonElement;
const cancelJobBtn = document.getElementById("cancelJobBtn") as HTMLButtonElement;
const enrichLimitInput = document.getElementById("enrichLimit") as HTMLInputElement;
const unfollowLimitInput = document.getElementById("unfollowLimit") as HTMLInputElement;
const lastScanEl = document.getElementById("lastScan") as HTMLDivElement;
const activitySummaryEl = document.getElementById("activitySummary") as HTMLDivElement;
const reviewMetaEl = document.getElementById("reviewMeta") as HTMLDivElement;
const reviewListEl = document.getElementById("reviewList") as HTMLDivElement;
const exportLastJsonBtn = document.getElementById("exportLastJson") as HTMLButtonElement;
const exportLastCsvBtn = document.getElementById("exportLastCsv") as HTMLButtonElement;
const exportInactiveJsonBtn = document.getElementById("exportInactiveJson") as HTMLButtonElement;
const exportInactiveCsvBtn = document.getElementById("exportInactiveCsv") as HTMLButtonElement;
const selectVisibleBtn = document.getElementById("selectVisibleBtn") as HTMLButtonElement;
const clearSelectionBtn = document.getElementById("clearSelectionBtn") as HTMLButtonElement;
const unfollowSelectedBtn = document.getElementById("unfollowSelectedBtn") as HTMLButtonElement;

let cachedLast: LastScan | null = null;
let cachedScanSession: ScanSession | null = null;
let cachedJob: JobState | null = null;
let currentCandidates: ClassifiedUser[] = [];
const selectedUsernames = new Set<string>();
let lastSeenJobFingerprint = "";

function setStatus(msg: string, type: "info" | "error" | "success" = "info") {
  statusEl.textContent = msg || "";
  statusEl.style.color =
    type === "error"
      ? "rgba(242,143,143,0.95)"
      : type === "success"
        ? "rgba(120,215,190,0.95)"
        : "rgba(232,237,246,0.75)";
}

function isValidFollowingUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const validHost =
      url.hostname === "x.com" ||
      url.hostname === "www.x.com" ||
      url.hostname === "twitter.com" ||
      url.hostname === "www.twitter.com";

    return validHost && url.pathname.includes("/following");
  } catch {
    return false;
  }
}

function parseEnrichLimit() {
  const parsed = Number.parseInt(enrichLimitInput.value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

function parseUnfollowLimit() {
  const parsed = Number.parseInt(unfollowLimitInput.value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 25;
  return Math.max(1, parsed);
}

function formatLastScan(last: LastScan) {
  const when = new Date(last.timestamp).toLocaleString();
  const summary = last.summary;
  const lines = [
    `Time: ${when}`,
    `Total: ${summary.total}`,
    `Resolved: ${summary.Resolved}`,
    `Over 30d: ${summary.Over30}`,
    `Active: ${summary.Active}`,
    `Dormant: ${summary.Dormant}`,
    `Inactive: ${summary.Inactive}`,
    `Unknown: ${summary.Unknown}`
  ];

  if (summary.Resolved === 0 && summary.total > 0) {
    lines.push("Activity resolution has not produced results yet.");
  }

  return lines.join("\n");
}

function formatActivitySummary(last: LastScan) {
  const summary = last.summary;
  const report = last.report;
  const lines = [
    `Resolved profiles: ${summary.Resolved}/${summary.total}`,
    report ? `Resolution rate: ${Math.round(report.successRate * 1000) / 10}%${report.targetResolved90 ? " | target met" : " | below 90% target"}` : "",
    `Inactive for more than 30 days: ${summary.Over30}`,
    `Still unknown: ${summary.Unknown}`
  ].filter(Boolean);

  if (summary.Resolved === 0 && summary.total > 0) {
    lines.push("Scan now auto-starts API fast-path enrichment, with helper tabs as fallback.");
  }

  const performance = report?.performance;
  if (performance?.scanElapsedMs) {
    lines.push(`Scan time: ${Math.round(performance.scanElapsedMs / 1000)}s`);
  }
  if (performance?.apiPagination) {
    const api = performance.apiPagination;
    lines.push(
      `Following API: ${api.users} profiles across ${api.pages} pages${api.rateLimits ? ` | ${api.rateLimits} rate limits` : ""}.`
    );
  }
  if (performance?.fastPath) {
    const fast = performance.fastPath;
    lines.push(
      `Fast path: ${fast.resolved}/${fast.attempted} resolved | ${Math.round(fast.profilesPerMinute)} profiles/min${
        fast.rateLimited ? ` | ${fast.rateLimited} rate limits` : ""
      }.`
    );
  }
  if (performance?.helper) {
    const helper = performance.helper;
    lines.push(
      `Helper fallback: ${helper.succeeded}/${helper.completed} resolved | ${helper.workers} workers | ${Math.round(
        helper.profilesPerMinute
      )} profiles/min.`
    );
  }

  return lines.join("\n");
}

function formatAge(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function scanSessionIsIncomplete(session: ScanSession | null) {
  return Boolean(session && (session.status === "paused" || session.status === "recoverable_error"));
}

function scanSessionIsRunning(session: ScanSession | null) {
  return session?.status === "running";
}

function scanSessionBlocksActions(session: ScanSession | null) {
  return scanSessionIsRunning(session) || scanSessionIsIncomplete(session);
}

function formatWorkflow(session: ScanSession | null, job: JobState | null) {
  const lines: string[] = [];

  if (!session) {
    lines.push("No active scan session.");
    if (cachedLast?.summary.total) lines.push(`Last completed scan: ${cachedLast.summary.total} profiles.`);
  } else {
    lines.push(`Scan: ${session.status.replace("_", " ")} | ${session.phase.replace("_", " ")}`);
    lines.push(`Saved profiles: ${session.users.length}`);
    if (session.summary) {
      lines.push(`Resolved: ${session.summary.Resolved}/${session.summary.total}`);
    }
    if (session.progress) {
      lines.push(`Rounds: ${session.progress.rounds} | visible cells: ${session.progress.visibleCells}`);
    }
    lines.push(`Checkpoint: ${formatAge(session.updatedAt)}`);
    if (session.error) lines.push(`Issue: ${session.error}`);
    if (session.resumeHint) lines.push(session.resumeHint);
  }

  if (job?.status === "running") {
    lines.push(`${job.type === "enrich" ? "Enrichment" : "Unfollow"} job running: ${job.completed}/${job.total}.`);
  }

  return lines.join("\n");
}

function resolvePrimaryScanAction() {
  if (scanSessionIsRunning(cachedScanSession)) return "running";
  if (scanSessionIsIncomplete(cachedScanSession)) return "resume";
  return "start";
}

function updateWorkflowControls(job: JobState | null) {
  const runningJob = Boolean(job && job.status === "running");
  const runningScan = scanSessionIsRunning(cachedScanSession);
  const incompleteScan = scanSessionIsIncomplete(cachedScanSession);
  const savedCheckpointCount = cachedScanSession?.users.length ?? 0;
  const hasEnrichmentSource = Boolean(cachedLast?.users.length || savedCheckpointCount > 0);
  const primaryAction = resolvePrimaryScanAction();

  startBtn.textContent =
    primaryAction === "resume"
      ? "Resume scan"
      : cachedScanSession?.status === "completed" || cachedLast
        ? "Start new scan"
        : "Start scan";
  startBtn.disabled = runningJob || runningScan;

  pauseScanBtn.disabled = !runningScan;
  enrichBtn.textContent =
    (runningScan || incompleteScan) && savedCheckpointCount > 0
      ? `Enrich saved ${savedCheckpointCount}`
      : cachedLast?.summary.Resolved && cachedLast.summary.Resolved < cachedLast.summary.total
        ? "Resume enrichment"
        : "Start enrichment";
  enrichBtn.disabled = runningJob || !hasEnrichmentSource;
  clearScanBtn.disabled = runningScan || !cachedScanSession || cachedScanSession.status === "completed";
  updateSelectionState();
}

function getInactiveCandidates(last: LastScan) {
  return last.users
    .filter((user) => user.inactiveOver30 && user.enrichmentStatus === "done" && !user.unfollowedAt)
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

function renderReviewList() {
  reviewListEl.innerHTML = "";

  if (!cachedLast) {
    reviewMetaEl.textContent = "Run a scan first.";
    selectVisibleBtn.disabled = true;
    clearSelectionBtn.disabled = true;
    unfollowSelectedBtn.disabled = true;
    return;
  }

  currentCandidates = getInactiveCandidates(cachedLast);
  const visible = currentCandidates.slice(0, 80);

  if (visible.length === 0) {
    reviewMetaEl.textContent =
      cachedLast.summary.Resolved === 0
        ? "Activity resolution is still pending. Once profiles resolve, inactive accounts will appear here."
        : "No enriched accounts are currently marked as inactive for more than 30 days.";
    selectVisibleBtn.disabled = true;
    clearSelectionBtn.disabled = selectedUsernames.size === 0;
    unfollowSelectedBtn.disabled = true;
    return;
  }

  reviewMetaEl.textContent =
    currentCandidates.length > visible.length
      ? `Showing ${visible.length} of ${currentCandidates.length} enriched inactive accounts.`
      : `${currentCandidates.length} enriched inactive accounts ready for review.`;

  for (const user of visible) {
    const row = document.createElement("label");
    row.className = "reviewItem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedUsernames.has(user.username);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedUsernames.add(user.username);
      else selectedUsernames.delete(user.username);
      updateSelectionState();
    });

    const meta = document.createElement("div");
    const name = document.createElement("div");
    name.className = "reviewName";
    name.textContent = `@${user.username}`;

    const sub = document.createElement("div");
    sub.className = "reviewSub";
    const state = user.profileState === "posts" ? user.displayName || "Activity enriched" : user.note || user.profileState;
    sub.textContent = `${state}${user.lastCheckedAt ? ` | checked ${new Date(user.lastCheckedAt).toLocaleDateString()}` : ""}`;

    const days = document.createElement("div");
    days.className = "reviewDays";
    days.textContent = user.daysSince === null ? "Unknown" : `${user.daysSince}d`;

    meta.append(name, sub);
    row.append(checkbox, meta, days);
    reviewListEl.appendChild(row);
  }

  selectVisibleBtn.disabled = false;
  clearSelectionBtn.disabled = selectedUsernames.size === 0;
  updateSelectionState();
}

function updateSelectionState() {
  clearSelectionBtn.disabled = selectedUsernames.size === 0;
  unfollowSelectedBtn.disabled =
    selectedUsernames.size === 0 || Boolean(cachedJob && cachedJob.status === "running") || scanSessionBlocksActions(cachedScanSession);
}

async function refreshLastScan() {
  const last = await loadLastScan().catch(() => null);
  cachedLast = last;

  if (!last) {
    lastScanEl.textContent = "-";
    activitySummaryEl.textContent = "-";
    exportLastJsonBtn.disabled = true;
    exportLastCsvBtn.disabled = true;
    exportInactiveJsonBtn.disabled = true;
    exportInactiveCsvBtn.disabled = true;
    renderReviewList();
    return;
  }

  lastScanEl.textContent = formatLastScan(last);
  activitySummaryEl.textContent = formatActivitySummary(last);
  exportLastJsonBtn.disabled = false;
  exportLastCsvBtn.disabled = false;

  const inactive = getInactiveCandidates(last);
  exportInactiveJsonBtn.disabled = inactive.length === 0;
  exportInactiveCsvBtn.disabled = inactive.length === 0;

  for (const username of Array.from(selectedUsernames)) {
    if (!inactive.some((user) => user.username === username)) selectedUsernames.delete(username);
  }

  renderReviewList();
}

async function refreshScanSession(job: JobState | null = null) {
  cachedScanSession = await requestBackground<ScanSession | null>({ action: "FOLLOWGRAPH_GET_SCAN_SESSION" }).catch(() => null);
  workflowStatusEl.textContent = formatWorkflow(cachedScanSession, job);
  updateWorkflowControls(job);
}

async function requestBackground<T>(payload: Record<string, unknown>) {
  return (await chrome.runtime.sendMessage(payload)) as T;
}

function formatJob(job: JobState | null) {
  if (!job) {
    if (cachedLast?.summary.total && cachedLast.summary.Resolved < cachedLast.summary.total) {
      return "No active job. Use Resume Enrichment if activity resolution stopped before completion.";
    }
    return "No active job.";
  }

  const workers = job.workers ?? [];
  const activeWorkers = workers.filter((worker) => worker.currentUser).length;
  const workerSummary =
    workers.length > 0 ? `Workers: ${activeWorkers}/${workers.length} active` : job.concurrency ? `Workers: ${job.concurrency}` : "";
  const currentHandles = workers
    .filter((worker) => worker.currentUser)
    .slice(0, 3)
    .map((worker) => `@${worker.currentUser?.username}`);

  return [
    `${job.type === "enrich" ? "Enrichment" : "Unfollow"} | ${job.status}`,
    `Progress: ${job.completed}/${job.total}`,
    `Succeeded: ${job.succeeded} | Failed: ${job.failed} | Skipped: ${job.skipped}`,
    job.telemetry
      ? `Fast path: ${job.telemetry.apiResolved ?? 0} API | ${job.telemetry.domResolved ?? 0} DOM | ${Math.round(job.telemetry.profilesPerMinute ?? 0)} profiles/min`
      : "",
    workerSummary,
    currentHandles.length > 0 ? `Current: ${currentHandles.join(", ")}${activeWorkers > currentHandles.length ? ", ..." : ""}` : "",
    job.message
  ]
    .filter(Boolean)
    .join("\n");
}

async function refreshJobState() {
  const job = await requestBackground<JobState | null>({ action: "FOLLOWGRAPH_GET_JOB_STATE" }).catch(() => null);
  cachedJob = job;
  jobStatusEl.textContent = formatJob(job);
  cancelJobBtn.disabled = !job || job.status !== "running";

  const running = Boolean(job && job.status === "running");
  if (running) unfollowSelectedBtn.disabled = true;
  await refreshScanSession(job);

  const sessionFingerprint = cachedScanSession
    ? `${cachedScanSession.id}:${cachedScanSession.status}:${cachedScanSession.phase}:${cachedScanSession.users.length}:${cachedScanSession.updatedAt}`
    : "no-session";
  const fingerprint = `${job ? `${job.id}:${job.status}:${job.completed}:${job.failed}:${job.succeeded}` : "none"}:${sessionFingerprint}`;
  if (fingerprint !== lastSeenJobFingerprint) {
    lastSeenJobFingerprint = fingerprint;
    await refreshLastScan();
    await refreshScanSession(job);
  }
}

exportLastJsonBtn.addEventListener("click", () => {
  if (!cachedLast) return;
  const ts = new Date(cachedLast.timestamp).toISOString().replace(/[:.]/g, "-");
  downloadJson(`followgraph-lastscan-${ts}.json`, cachedLast);
});

exportLastCsvBtn.addEventListener("click", () => {
  if (!cachedLast) return;
  const ts = new Date(cachedLast.timestamp).toISOString().replace(/[:.]/g, "-");
  downloadCsv(`followgraph-lastscan-${ts}.csv`, toCSV(cachedLast.users));
});

exportInactiveJsonBtn.addEventListener("click", () => {
  if (!cachedLast) return;
  const rows = getInactiveCandidates(cachedLast);
  const ts = new Date(cachedLast.timestamp).toISOString().replace(/[:.]/g, "-");
  downloadJson(`followgraph-inactive-over-30-${ts}.json`, rows);
});

exportInactiveCsvBtn.addEventListener("click", () => {
  if (!cachedLast) return;
  const rows = getInactiveCandidates(cachedLast);
  const ts = new Date(cachedLast.timestamp).toISOString().replace(/[:.]/g, "-");
  downloadCsv(`followgraph-inactive-over-30-${ts}.csv`, toCSV(rows));
});

selectVisibleBtn.addEventListener("click", () => {
  for (const user of currentCandidates.slice(0, 80)) selectedUsernames.add(user.username);
  renderReviewList();
});

clearSelectionBtn.addEventListener("click", () => {
  selectedUsernames.clear();
  renderReviewList();
});

cancelJobBtn.addEventListener("click", async () => {
  const result = await requestBackground<{ ok: boolean; message: string }>({ action: "FOLLOWGRAPH_CANCEL_JOB" });
  setStatus(result.message, result.ok ? "success" : "error");
  await refreshJobState();
});

async function getActiveFollowingTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab?.url) {
    setStatus("No active tab detected.", "error");
    return null;
  }

  if (!isValidFollowingUrl(tab.url)) {
    setStatus("Open a /following page first.", "error");
    return null;
  }

  return tab;
}

async function injectScanner(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["scanner.js"]
  });
}

startBtn.addEventListener("click", async () => {
  try {
    setStatus("");

    const tab = await getActiveFollowingTab();
    if (!tab?.id) return;

    const action = resolvePrimaryScanAction() === "resume" ? "FOLLOWGRAPH_RESUME_SCAN" : "FOLLOWGRAPH_START_SCAN";

    setStatus(action === "FOLLOWGRAPH_RESUME_SCAN" ? "Resuming scanner..." : "Injecting scanner...");
    await injectScanner(tab.id);
    await chrome.tabs.sendMessage(tab.id, { action, tabId: tab.id });
    setStatus(
      action === "FOLLOWGRAPH_RESUME_SCAN"
        ? "Scan resumed from the saved checkpoint."
        : "Scan started. Activity resolution will auto-start after the scan completes.",
      "success"
    );
    await refreshJobState();
  } catch (error) {
    console.error(error);
    setStatus("Scan injection failed. See console.", "error");
  }
});

pauseScanBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveFollowingTab();
    if (!tab?.id) return;

    await injectScanner(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, { action: "FOLLOWGRAPH_CANCEL_SCAN" }).catch(() => ({
      ok: false,
      message: "Could not reach the running scan. It may already be stopped."
    }));
    setStatus(result?.message || "Pause requested.", result?.ok ? "success" : "error");
    await refreshJobState();
  } catch (error) {
    console.error(error);
    setStatus("Pause failed. See console.", "error");
  }
});

enrichBtn.addEventListener("click", async () => {
  if (scanSessionIsRunning(cachedScanSession)) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (tab?.id && tab.url && isValidFollowingUrl(tab.url)) {
      await injectScanner(tab.id).catch(() => {});
      await chrome.tabs.sendMessage(tab.id, { action: "FOLLOWGRAPH_CANCEL_SCAN" }).catch(() => null);
    }
  }

  const limit = parseEnrichLimit();
  const result = await requestBackground<{ ok: boolean; message: string }>({
    action: "FOLLOWGRAPH_START_ENRICHMENT",
    limit
  });

  setStatus(result.message, result.ok ? "success" : "error");
  await refreshJobState();
});

clearScanBtn.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear the saved incomplete scan session? Completed scan exports will stay available.");
  if (!confirmed) return;

  const result = await requestBackground<{ ok: boolean; message: string }>({ action: "FOLLOWGRAPH_CLEAR_SCAN_SESSION" });
  setStatus(result.message, result.ok ? "success" : "error");
  await refreshJobState();
});

unfollowSelectedBtn.addEventListener("click", async () => {
  if (selectedUsernames.size === 0) {
    setStatus("Select at least one inactive account first.", "error");
    return;
  }

  const limit = parseUnfollowLimit();
  const usernames = Array.from(selectedUsernames).slice(0, limit);
  const confirmed = window.confirm(
    `Unfollow ${usernames.length} selected account${usernames.length === 1 ? "" : "s"}? Only enriched accounts inactive for more than 30 days will be processed.`
  );

  if (!confirmed) {
    setStatus("Unfollow cancelled.");
    return;
  }

  const result = await requestBackground<{ ok: boolean; message: string }>({
    action: "FOLLOWGRAPH_START_UNFOLLOW",
    usernames,
    limit
  });

  setStatus(result.message, result.ok ? "success" : "error");
  await refreshJobState();
});

void refreshLastScan().catch(console.error);
void refreshJobState().catch(console.error);
window.setInterval(() => {
  void refreshJobState().catch(console.error);
}, 1500);
