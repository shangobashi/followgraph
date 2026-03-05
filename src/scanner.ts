import type { ClassifiedUser, Progress, ScanSummary, User } from "./types";
import { parseVisibleUsers } from "./parser";
import { UserStore } from "./store";
import { runScrollLoop } from "./scroller";
import { ensureUI, uiEnableExport, uiSetFinalStatus, uiSetStatus, uiSetSummary, uiUpdateProgress } from "./ui";
import { loadLastScan, saveLastScan } from "./storage";

declare global {
  interface Window {
    __FOLLOWGRAPH_RUNNING__?: boolean;
  }
}

function isFollowingPage(): boolean {
  const hostOk = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(location.hostname);
  const pathOk = location.pathname.includes("/following");
  return hostOk && pathOk;
}

function daysBetween(nowMs: number, thenMs: number) {
  return Math.floor((nowMs - thenMs) / (1000 * 60 * 60 * 24));
}

function classifyUsers(users: User[], now = Date.now()): ClassifiedUser[] {
  return users.map((u) => {
    let category: ClassifiedUser["category"] = "Unknown";
    let daysSince: number | null = null;

    if (u.lastActivityISO) {
      const t = Date.parse(u.lastActivityISO);
      if (!Number.isNaN(t)) {
        daysSince = daysBetween(now, t);
        if (daysSince <= 30) category = "Active";
        else if (daysSince <= 180) category = "Dormant";
        else category = "Inactive";
      }
    }

    return { ...u, category, daysSince };
  });
}

function summarize(classified: ClassifiedUser[]): ScanSummary {
  const summary: ScanSummary = { total: classified.length, Active: 0, Dormant: 0, Inactive: 0, Unknown: 0 };
  for (const u of classified) summary[u.category] = (summary[u.category] || 0) + 1;
  return summary;
}

async function runScan() {
  if (!isFollowingPage()) {
    ensureUI();
    uiSetStatus("Open a /following page first.");
    return;
  }

  ensureUI();
  uiSetStatus("Scanning...");

  const last = await loadLastScan().catch(() => null);
  void last;

  const store = new UserStore();
  let extractedTotal = 0;

  const result = await runScrollLoop({
    onTick: (t) => {
      const visible = parseVisibleUsers();
      store.add(visible);
      extractedTotal = store.size();

      const p: Progress = {
        ...t,
        extractedTotal
      };

      uiUpdateProgress(p);
      uiSetStatus(t.progressed ? "Scanning..." : "Scanning (waiting for load)...");
    }
  });

  uiSetFinalStatus(result.reason);

  const users = store.values();
  const classified = classifyUsers(users);
  const summary = summarize(classified);

  uiSetSummary(summary);
  uiEnableExport(classified);

  await saveLastScan(classified, summary).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg: { action?: string }) => {
  if (msg?.action !== "FOLLOWGRAPH_START") return;

  if (window.__FOLLOWGRAPH_RUNNING__) {
    ensureUI();
    uiSetStatus("Already running.");
    return;
  }

  window.__FOLLOWGRAPH_RUNNING__ = true;

  runScan()
    .catch((e) => {
      console.error(e);
      ensureUI();
      uiSetStatus("Error. See console.");
    })
    .finally(() => {
      window.__FOLLOWGRAPH_RUNNING__ = false;
    });
});
