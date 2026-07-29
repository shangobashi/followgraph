import type { ClassifiedUser, JobState, LastScan, PerformanceTelemetry, ScanSession, ScanSummary, UnfollowAuditEntry } from "./types";
import { buildScanReport } from "./report";

export const LAST_SCAN_KEY = "followgraph:lastScan";
export const JOB_KEY = "followgraph:job";
export const AUDIT_KEY = "followgraph:unfollowAudit";
export const SCAN_SESSION_KEY = "followgraph:scanSession";

export async function saveLastScan(
  users: ClassifiedUser[],
  summary: ScanSummary,
  timestamp = Date.now(),
  performance: PerformanceTelemetry | undefined = undefined
) {
  const existing = await chrome.storage.local.get(LAST_SCAN_KEY);
  const previous = existing[LAST_SCAN_KEY] as LastScan | undefined;
  const payload: LastScan = {
    timestamp,
    users,
    summary,
    report: buildScanReport(users, summary, timestamp, performance?.scanElapsedMs ?? null, performance ?? previous?.report?.performance)
  };
  await chrome.storage.local.set({ [LAST_SCAN_KEY]: payload });
}

export async function loadLastScan(): Promise<LastScan | null> {
  const data = await chrome.storage.local.get(LAST_SCAN_KEY);
  return (data[LAST_SCAN_KEY] as LastScan) || null;
}

export async function saveScanSession(session: ScanSession | null) {
  if (!session) {
    await chrome.storage.local.remove(SCAN_SESSION_KEY);
    return;
  }

  await chrome.storage.local.set({ [SCAN_SESSION_KEY]: { ...session, updatedAt: Date.now() } });
}

export async function loadScanSession(): Promise<ScanSession | null> {
  const data = await chrome.storage.local.get(SCAN_SESSION_KEY);
  return (data[SCAN_SESSION_KEY] as ScanSession) || null;
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
