import type { ClassifiedUser, LastScan, ScanSummary } from "./types";

const KEY = "followgraph:lastScan";

export async function saveLastScan(users: ClassifiedUser[], summary: ScanSummary) {
  const payload: LastScan = {
    timestamp: Date.now(),
    users,
    summary
  };
  await chrome.storage.local.set({ [KEY]: payload });
}

export async function loadLastScan(): Promise<LastScan | null> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as LastScan) || null;
}
