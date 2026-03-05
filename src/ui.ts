import type { ClassifiedUser, Progress, ScanSummary, StopReason } from "./types";
import { downloadCsv, downloadJson, toCSV } from "./exporter";

const PANEL_ID = "followgraph-root";
const VERSION = "v1.0.0";
const BRAND = "Made by Shango Bashi";
const GITHUB_URL = "https://github.com/shangobashi/followgraph";

function msToClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rS = s % 60;
  const h = Math.floor(m / 60);
  const rM = m % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(rM)}:${pad(rS)}` : `${m}:${pad(rS)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  children: Array<Node | string> = []
) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && v && typeof v === "object") Object.assign((node as HTMLElement).style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (v != null) node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

type Refs = {
  status: HTMLDivElement | null;
  extracted: HTMLDivElement | null;
  visible: HTMLDivElement | null;
  rounds: HTMLDivElement | null;
  idle: HTMLDivElement | null;
  delay: HTMLDivElement | null;
  elapsed: HTMLDivElement | null;
  active: HTMLDivElement | null;
  dormant: HTMLDivElement | null;
  inactive: HTMLDivElement | null;
  unknown: HTMLDivElement | null;
  exportJsonBtn: HTMLButtonElement | null;
  exportCsvBtn: HTMLButtonElement | null;
};

const refs: Refs = {
  status: null,
  extracted: null,
  visible: null,
  rounds: null,
  idle: null,
  delay: null,
  elapsed: null,
  active: null,
  dormant: null,
  inactive: null,
  unknown: null,
  exportJsonBtn: null,
  exportCsvBtn: null
};

export function ensureUI() {
  if (document.getElementById(PANEL_ID)) return;

  const root = el("div", { id: PANEL_ID });
  Object.assign(root.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647"
  });

  const shadow = root.attachShadow({ mode: "open" });

  const style = el("style");
  style.textContent = `
    :host { all: initial; }
    .panel {
      width: 300px;
      background: rgba(15, 15, 18, 0.95);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      padding: 12px;
      color: rgba(230,230,230,0.95);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      line-height: 1.35;
    }
    .top {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap: 10px;
      margin-bottom: 8px;
    }
    .title { font-size: 12px; font-weight: 800; letter-spacing: 0.2px; }
    .meta {
      font-size: 10px;
      color: rgba(230,230,230,0.55);
      display:flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 2px;
    }
    .meta a {
      color: rgba(230,230,230,0.75);
      text-decoration: none;
      border-bottom: 1px dotted rgba(230,230,230,0.25);
    }
    .meta a:hover { color: rgba(230,230,230,0.95); }
    .close {
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      color: rgba(230,230,230,0.85);
      border-radius: 10px;
      cursor: pointer;
      padding: 4px 8px;
      font-size: 11px;
      height: fit-content;
      flex-shrink: 0;
    }
    .close:hover { background: rgba(255,255,255,0.07); }
    .status { font-size: 11px; color: rgba(230,230,230,0.80); margin-bottom: 10px; min-height: 16px; }
    .grid {
      display:grid;
      grid-template-columns: 1fr auto;
      gap: 6px 10px;
      font-size: 11px;
      margin-bottom: 10px;
      background: rgba(255,255,255,0.03);
      padding: 10px;
      border-radius: 10px;
    }
    .label { color: rgba(230,230,230,0.70); }
    .value { color: rgba(230,230,230,0.93); text-align: right; font-variant-numeric: tabular-nums; }
    .value.active { color: rgba(120,200,160,0.95); }
    .value.dormant { color: rgba(255, 200, 100, 0.9); }
    .value.inactive { color: rgba(255,120,120,0.85); }
    .value.unknown { color: rgba(230,230,230,0.55); }
    .btnRow { display:flex; gap: 8px; margin-bottom: 8px; }
    .btn {
      flex: 1;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      color: rgba(230,230,230,0.92);
      border-radius: 12px;
      cursor: pointer;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 800;
      font-family: inherit;
    }
    .btn:hover { background: rgba(255,255,255,0.07); }
    .btn[disabled] { opacity: 0.55; cursor: not-allowed; }
    .sub {
      margin-top: 8px;
      font-size: 10px;
      color: rgba(230,230,230,0.55);
      display:flex;
      flex-direction: column;
      gap: 4px;
      text-align: center;
    }
  `;

  const closeBtn = el("button", { class: "close", onClick: () => root.remove() }, ["Close"]);

  refs.status = el("div", { class: "status" }, ["Status: -"]);
  refs.extracted = el("div", { class: "value" }, ["0"]);
  refs.visible = el("div", { class: "value" }, ["0"]);
  refs.rounds = el("div", { class: "value" }, ["0"]);
  refs.idle = el("div", { class: "value" }, ["0"]);
  refs.delay = el("div", { class: "value" }, ["-"]);
  refs.elapsed = el("div", { class: "value" }, ["0:00"]);
  refs.active = el("div", { class: "value active" }, ["-"]);
  refs.dormant = el("div", { class: "value dormant" }, ["-"]);
  refs.inactive = el("div", { class: "value inactive" }, ["-"]);
  refs.unknown = el("div", { class: "value unknown" }, ["-"]);
  refs.exportJsonBtn = el("button", { class: "btn", disabled: "true" }, ["Export JSON"]) as HTMLButtonElement;
  refs.exportCsvBtn = el("button", { class: "btn", disabled: "true" }, ["Export CSV"]) as HTMLButtonElement;

  const titleRow = el("div", {}, [
    el("div", { class: "title" }, [`FollowGraph ${VERSION}`]),
    el("div", { class: "meta" }, [
      el("span", {}, ["Client-side"]),
      el("span", {}, ["•"]),
      el("a", { href: GITHUB_URL, target: "_blank", rel: "noreferrer noopener" }, ["GitHub"])
    ])
  ]);

  const grid = el("div", { class: "grid" }, [
    el("div", { class: "label" }, ["Extracted unique"]),
    refs.extracted,
    el("div", { class: "label" }, ["Visible cells"]),
    refs.visible,
    el("div", { class: "label" }, ["Rounds"]),
    refs.rounds,
    el("div", { class: "label" }, ["Idle rounds"]),
    refs.idle,
    el("div", { class: "label" }, ["Delay"]),
    refs.delay,
    el("div", { class: "label" }, ["Elapsed"]),
    refs.elapsed,
    el("div", { class: "label" }, ["Active (<=30d)"]),
    refs.active,
    el("div", { class: "label" }, ["Dormant (<=180d)"]),
    refs.dormant,
    el("div", { class: "label" }, ["Inactive (>180d)"]),
    refs.inactive,
    el("div", { class: "label" }, ["Unknown"]),
    refs.unknown
  ]);

  const btnRow = el("div", { class: "btnRow" }, [refs.exportJsonBtn, refs.exportCsvBtn]);

  const panel = el("div", { class: "panel" }, [
    el("div", { class: "top" }, [titleRow, closeBtn]),
    refs.status,
    grid,
    btnRow,
    el("div", { class: "sub" }, [el("div", {}, ["No data leaves your browser."]), el("div", {}, [BRAND])])
  ]);

  shadow.append(style, panel);
  document.documentElement.appendChild(root);
}

export function uiSetStatus(msg: string) {
  if (!refs.status) return;
  refs.status.textContent = `Status: ${msg}`;
}

export function uiUpdateProgress(p: Progress) {
  if (!refs.extracted || !refs.visible || !refs.rounds || !refs.idle || !refs.delay || !refs.elapsed) return;

  refs.extracted.textContent = String(p.extractedTotal ?? 0);
  refs.visible.textContent = String(p.visibleCells ?? 0);
  refs.rounds.textContent = String(p.rounds ?? 0);
  refs.idle.textContent = String(p.idleRounds ?? 0);
  refs.delay.textContent = `${Math.round(p.delayMs)}ms`;
  refs.elapsed.textContent = msToClock(p.elapsedMs);
}

export function uiSetSummary(summary: ScanSummary) {
  if (!refs.active || !refs.dormant || !refs.inactive || !refs.unknown) return;
  refs.active.textContent = String(summary.Active ?? 0);
  refs.dormant.textContent = String(summary.Dormant ?? 0);
  refs.inactive.textContent = String(summary.Inactive ?? 0);
  refs.unknown.textContent = String(summary.Unknown ?? 0);
}

export function uiEnableExport(classified: ClassifiedUser[]) {
  if (!refs.exportJsonBtn || !refs.exportCsvBtn) return;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  const jsonButton = refs.exportJsonBtn.cloneNode(true) as HTMLButtonElement;
  refs.exportJsonBtn.replaceWith(jsonButton);
  refs.exportJsonBtn = jsonButton;
  refs.exportJsonBtn.removeAttribute("disabled");
  refs.exportJsonBtn.addEventListener("click", () => {
    downloadJson(`followgraph-${ts}.json`, classified);
  });

  const csvButton = refs.exportCsvBtn.cloneNode(true) as HTMLButtonElement;
  refs.exportCsvBtn.replaceWith(csvButton);
  refs.exportCsvBtn = csvButton;
  refs.exportCsvBtn.removeAttribute("disabled");
  refs.exportCsvBtn.addEventListener("click", () => {
    downloadCsv(`followgraph-${ts}.csv`, toCSV(classified));
  });
}

export function uiSetFinalStatus(reason: StopReason) {
  if (reason === "hardCap") uiSetStatus("Stopped (safety cap)");
  else if (reason === "maxUsers") uiSetStatus("Stopped (max users cap)");
  else uiSetStatus("Complete");
}
