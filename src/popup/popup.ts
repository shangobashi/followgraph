import type { LastScan } from "../types";
import { loadLastScan } from "../storage";
import { downloadCsv, downloadJson, toCSV } from "../exporter";

const statusEl = document.getElementById("status") as HTMLDivElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const lastScanEl = document.getElementById("lastScan") as HTMLDivElement;
const diffEl = document.getElementById("diff") as HTMLDivElement;
const exportLastJsonBtn = document.getElementById("exportLastJson") as HTMLButtonElement;
const exportLastCsvBtn = document.getElementById("exportLastCsv") as HTMLButtonElement;

function setStatus(msg: string, type: "info" | "error" | "success" = "info") {
  statusEl.textContent = msg || "";
  statusEl.style.color =
    type === "error"
      ? "rgba(255,120,120,0.9)"
      : type === "success"
        ? "rgba(120,200,160,0.9)"
        : "rgba(230,230,230,0.75)";
}

function isValidFollowingUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const validHost =
      url.hostname === "x.com" ||
      url.hostname === "www.x.com" ||
      url.hostname === "twitter.com" ||
      url.hostname === "www.twitter.com";

    const isFollowing = url.pathname.includes("/following");
    return validHost && isFollowing;
  } catch {
    return false;
  }
}

function formatLastScan(last: LastScan) {
  const when = new Date(last.timestamp).toLocaleString();
  const s = last.summary;
  return `Time: ${when}\nTotal: ${s.total}\nActive: ${s.Active}\nDormant: ${s.Dormant}\nInactive: ${s.Inactive}\nUnknown: ${s.Unknown}`;
}

let cachedLast: LastScan | null = null;

async function refreshLastScan() {
  const last = await loadLastScan().catch(() => null);
  cachedLast = last;

  if (!last) {
    lastScanEl.textContent = "-";
    diffEl.textContent = "-";
    exportLastJsonBtn.disabled = true;
    exportLastCsvBtn.disabled = true;
    return;
  }

  lastScanEl.textContent = formatLastScan(last);
  exportLastJsonBtn.disabled = false;
  exportLastCsvBtn.disabled = false;
  diffEl.textContent = `Last total: ${last.summary.total}\nCurrent: (run a scan to compare)\nDelta: -`;
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

startBtn.addEventListener("click", async () => {
  try {
    setStatus("");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url) {
      setStatus("No active tab detected.", "error");
      return;
    }

    if (!isValidFollowingUrl(tab.url)) {
      setStatus("Open a /following page first.", "error");
      return;
    }

    setStatus("Injecting...");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["scanner.js"]
    });

    await chrome.tabs.sendMessage(tab.id, { action: "FOLLOWGRAPH_START" });
    setStatus("Started. Check the page overlay.", "success");
  } catch (e) {
    console.error(e);
    setStatus("Injection failed. See console.", "error");
  }
});

refreshLastScan().catch(console.error);
