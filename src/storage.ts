import type { ClassifiedUser, JobState, LastScan, ScanSummary, UnfollowAuditEntry } from "./types";

export const LAST_SCAN_KEY = "followgraph:lastScan";
export const JOB_KEY = "followgraph:job";
export const AUDIT_KEY = "followgraph:unfollowAudit";

export async function saveLastScan(users: ClassifiedUser[], summary: ScanSummary, timestamp = Date.now()) {
  const payload: LastScan = {
    timestamp,
    users,
    summary
  };
  await chrome.storage.local.set({ [LAST_SCAN_KEY]: payload });
}

export async function loadLastScan(): Promise<LastScan | null> {
  const data = await chrome.storage.local.get(LAST_SCAN_KEY);
  return (data[LAST_SCAN_KEY] as LastScan) || null;
}

export async function saveJobState(job: JobState | null) {
  if (!job) {
    await chrome.storage.local.remove(JOB_KEY);
    return;
  }

  await chrome.storage.local.set({ [JOB_KEY]: job });
}

export async function loadJobState(): Promise<JobState | null> {
  const data = await chrome.storage.local.get(JOB_KEY);
  return (data[JOB_KEY] as JobState) || null;
}

export async function appendUnfollowAudit(entries: UnfollowAuditEntry[]) {
  const existing = await loadUnfollowAudit();
  const next = [...entries, ...existing].slice(0, 500);
  await chrome.storage.local.set({ [AUDIT_KEY]: next });
}

export async function loadUnfollowAudit(): Promise<UnfollowAuditEntry[]> {
  const data = await chrome.storage.local.get(AUDIT_KEY);
  return (data[AUDIT_KEY] as UnfollowAuditEntry[]) || [];
}
