import type { Progress, ScanSummary } from "./types";
import { classifyUsers, summarize } from "./activity";
import { parseVisibleUsers } from "./parser";
import { extractProfileActivity, unfollowCurrentProfile } from "./profile";
import { UserStore } from "./store";
import { runScrollLoop } from "./scroller";
import { ensureUI, uiEnableExport, uiSetFinalStatus, uiSetStatus, uiSetSummary, uiUpdateProgress } from "./ui";
import { saveLastScan } from "./storage";

declare global {
  interface Window {
    __FOLLOWGRAPH_RUNNING__?: boolean;
    __FOLLOWGRAPH_LISTENER_READY__?: boolean;
  }
}

function isFollowingPage(): boolean {
  const hostOk = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(location.hostname);
  const pathOk = location.pathname.includes("/following");
  return hostOk && pathOk;
}

async function runScan() {
  if (!isFollowingPage()) {
    ensureUI();
    uiSetStatus("Open a /following page first.");
    return;
  }

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
}

function registerRuntimeListener() {
  if (window.__FOLLOWGRAPH_LISTENER_READY__) return;
  window.__FOLLOWGRAPH_LISTENER_READY__ = true;

  chrome.runtime.onMessage.addListener((msg: { action?: string; username?: string }, _sender: unknown, sendResponse: (value?: unknown) => void) => {
    if (msg?.action === "FOLLOWGRAPH_START") {
      if (window.__FOLLOWGRAPH_RUNNING__) {
        ensureUI();
        uiSetStatus("Already running.");
        return;
      }

      window.__FOLLOWGRAPH_RUNNING__ = true;

      runScan()
        .catch((error) => {
          console.error(error);
          ensureUI();
          uiSetStatus("Error. See console.");
        })
        .finally(() => {
          window.__FOLLOWGRAPH_RUNNING__ = false;
        });

      return;
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
