import type { Progress, StopReason } from "./types";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getScrollContainer(): Element | Document {
  const main = document.querySelector('div[role="main"]');
  if (!main) return document;

  let el: Element | null = main;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll") &&
      (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 50;

    if (canScroll) return el;
    el = el.parentElement;
  }

  return document;
}

function countUserCells(): number {
  const n = document.querySelectorAll('[data-testid="UserCell"]').length;
  if (n > 0) return n;

  return document.querySelectorAll("article").length;
}

export async function runScrollLoop(opts: {
  onTick: (p: Omit<Progress, "extractedTotal">) => void;
  scrollStepPx?: number;
  maxIdleRounds?: number;
  hardCapRounds?: number;
  maxUsers?: number;
  settleMsInitial?: number;
  pauseEveryN?: number;
  pauseDurationMs?: number;
}): Promise<{ reason: StopReason; rounds: number; elapsedMs: number; visibleCells: number }> {
  const scrollStepPx = opts.scrollStepPx ?? 1400;
  const maxIdleRounds = opts.maxIdleRounds ?? 7;
  const hardCapRounds = opts.hardCapRounds ?? 2000;
  const maxUsers = opts.maxUsers ?? 25000;

  const pauseEveryN = opts.pauseEveryN ?? 55;
  const pauseDurationMs = opts.pauseDurationMs ?? 1800;

  const minDelay = 650;
  const maxDelay = 1600;
  let settleMs = clamp(opts.settleMsInitial ?? 900, minDelay, maxDelay);

  const container = getScrollContainer();

  let idleRounds = 0;
  let rounds = 0;

  let lastCount = countUserCells();
  let newContentSinceLastRound = false;

  const startedAt = performance.now();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('[data-testid="UserCell"]') || node.querySelector?.('[data-testid="UserCell"]')) {
          newContentSinceLastRound = true;
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  try {
    await sleep(400);

    while (idleRounds < maxIdleRounds && rounds < hardCapRounds) {
      const elapsedMs = performance.now() - startedAt;
      rounds++;
      newContentSinceLastRound = false;

      const preCount = countUserCells();
      if (preCount >= maxUsers) {
        opts.onTick({
          rounds,
          idleRounds,
          visibleCells: preCount,
          progressed: false,
          delayMs: settleMs,
          elapsedMs
        });
        return { reason: "maxUsers", rounds, elapsedMs, visibleCells: preCount };
      }

      if (container === document) {
        window.scrollBy(0, scrollStepPx);
      } else {
        (container as Element).scrollBy({ top: scrollStepPx, left: 0, behavior: "instant" as ScrollBehavior });
      }

      const jitter = settleMs + (Math.random() * 260 - 130);
      await sleep(clamp(jitter, minDelay, maxDelay));

      if (pauseEveryN > 0 && rounds % pauseEveryN === 0) {
        await sleep(pauseDurationMs);
      }

      const currentCount = countUserCells();
      const progressed = newContentSinceLastRound || currentCount > lastCount;

      settleMs = progressed ? clamp(settleMs - 60, minDelay, maxDelay) : clamp(settleMs + 120, minDelay, maxDelay);

      if (progressed) {
        idleRounds = 0;
        lastCount = currentCount;
      } else {
        idleRounds++;
      }

      opts.onTick({
        rounds,
        idleRounds,
        visibleCells: currentCount,
        progressed,
        delayMs: settleMs,
        elapsedMs
      });
    }

    const elapsedMs = performance.now() - startedAt;
    const finalCount = countUserCells();
    return {
      reason: rounds >= hardCapRounds ? "hardCap" : "idle",
      rounds,
      elapsedMs,
      visibleCells: finalCount
    };
  } finally {
    observer.disconnect();
  }
}
