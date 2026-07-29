import type { ClassifiedUser, ScanSummary } from "./types";
import { classifyUsers, summarize } from "./activity";
import { saveLastScan } from "./storage";
import { createTelemetry, markResolved, serializeTelemetry, time } from "./telemetry";
import { isXApiFastPathAvailable, resolveProfileActivityViaXApi } from "./xapi";

const API_DEFAULT_CONCURRENCY = 32;
const API_MIN_CONCURRENCY = 8;
const API_MAX_CONCURRENCY = 64;
const API_FLUSH_BATCH_SIZE = 250;
const TARGET_RESOLUTION_RATE = 0.9;
const MAX_API_ATTEMPTS = 2;
const RATE_LIMIT_BASE_COOLDOWN_MS = 2_000;
const RATE_LIMIT_MAX_COOLDOWN_MS = 45_000;

export interface FastPathResult {
  users: ClassifiedUser[];
  summary: ScanSummary;
  attempted: number;
  resolved: number;
  failed: number;
  shouldFallback: boolean;
  telemetry: ReturnType<typeof serializeTelemetry>;
}

export interface FastPathOptions {
  onProgress?: (message: string, summary: ScanSummary) => void;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isResolved(user: ClassifiedUser) {
  return user.daysSince !== null || (user.enrichmentStatus === "done" && user.profileState !== "unknown");
}

function updateUser(user: ClassifiedUser, result: Awaited<ReturnType<typeof resolveProfileActivityViaXApi>>, now: number) {
  if (!result) {
    return classifyUsers(
      [
        {
          ...user,
          enrichmentStatus: "failed",
          lastCheckedAt: now,
          note: "API fast path unavailable for this profile."
        }
      ],
      now
    )[0];
  }

  return classifyUsers(
    [
      {
        ...user,
        restId: result.restId ?? user.restId ?? null,
        lastActivityISO: result.lastActivityISO,
        activitySource: result.activitySource,
        profileState: result.profileState,
        enrichmentStatus: result.profileState === "unknown" ? "failed" : "done",
        lastCheckedAt: now,
        note: result.note
      }
    ],
    now
  )[0];
}

export async function runApiFastPathEnrichment(
  inputUsers: ClassifiedUser[],
  inputSummary: ScanSummary,
  opts: FastPathOptions = {}
): Promise<FastPathResult> {
  const telemetry = createTelemetry();
  const users = inputUsers.map((user) => ({ ...user }));
  const queue = users
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => !isResolved(user) && !user.unfollowedAt);

  if (queue.length === 0) {
    return {
      users,
      summary: inputSummary,
      attempted: 0,
      resolved: 0,
      failed: 0,
      shouldFallback: false,
      telemetry: serializeTelemetry(telemetry)
    };
  }

  const available = await time(telemetry, "apiDiscovery", () => isXApiFastPathAvailable());
  if (!available) {
    return {
      users,
      summary: inputSummary,
      attempted: queue.length,
      resolved: 0,
      failed: 0,
      shouldFallback: true,
      telemetry: serializeTelemetry(telemetry)
    };
  }

  const workQueue = queue.map((item) => ({ index: item.index, attempts: 0 }));
  const totalQueue = workQueue.length;
  let cursor = 0;
  let active = 0;
  let completed = 0;
  let resolved = 0;
  let failed = 0;
  let dirty = 0;
  let concurrency = clamp(API_DEFAULT_CONCURRENCY, API_MIN_CONCURRENCY, API_MAX_CONCURRENCY);
  let summary = inputSummary;
  let rateLimitCooldownUntil = 0;

  async function flush(force = false) {
    if (!force && dirty < API_FLUSH_BATCH_SIZE) return;
    summary = summarize(users);
    await time(telemetry, "storageFlush", () => saveLastScan(users, summary));
    dirty = 0;
    opts.onProgress?.(
      `API fast path resolved ${resolved}/${queue.length} profiles (${Math.round(telemetry.profilesPerMinute)} profiles/min).`,
      summary
    );
  }

  async function runOne(item: { index: number; attempts: number }) {
    let finalAttempt = true;
    const index = item.index;
    const current = users[index];
    try {
      const result = await time(telemetry, "apiResolve", () =>
        resolveProfileActivityViaXApi({ username: current.username, restId: current.restId })
      );
      users[index] = updateUser(current, result, Date.now());
      if (result?.profileState !== "unknown") {
        resolved += 1;
        markResolved(telemetry, "api", completed + 1);
      } else {
        failed += 1;
        markResolved(telemetry, "failed", completed + 1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "API fast path failed.";
      const rateLimited = message.toLowerCase().includes("rate limited") || message.includes("429");
      if (rateLimited) {
        concurrency = clamp(Math.floor(concurrency * 0.65), API_MIN_CONCURRENCY, API_MAX_CONCURRENCY);
        const cooldownMs = Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, RATE_LIMIT_BASE_COOLDOWN_MS * 2 ** item.attempts);
        rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + cooldownMs);
        markResolved(telemetry, "rateLimited", completed + 1);
        if (item.attempts + 1 < MAX_API_ATTEMPTS) {
          workQueue.push({ index, attempts: item.attempts + 1 });
          finalAttempt = false;
          return;
        }
      } else {
        markResolved(telemetry, "failed", completed + 1);
      }

      failed += 1;
      users[index] = classifyUsers(
        [
          {
            ...current,
            enrichmentStatus: "failed",
            lastCheckedAt: Date.now(),
            note: message
          }
        ],
        Date.now()
      )[0];
    } finally {
      if (!finalAttempt) return;
      completed += 1;
      dirty += 1;

      if (completed > 0 && completed % 400 === 0 && failed / completed < 0.05) {
        concurrency = clamp(concurrency + 4, API_MIN_CONCURRENCY, API_MAX_CONCURRENCY);
      }

      await flush(false);
    }
  }

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (active < concurrency && cursor < workQueue.length && Date.now() >= rateLimitCooldownUntil) {
        const next = workQueue[cursor++];
        active += 1;
        void runOne(next)
          .catch(() => {})
          .finally(() => {
            active -= 1;
            if (completed >= totalQueue) {
              resolve();
              return;
            }
            void sleep(0).then(pump);
          });
      }

      if (active === 0 && cursor < workQueue.length && Date.now() < rateLimitCooldownUntil) {
        window.setTimeout(pump, Math.max(rateLimitCooldownUntil - Date.now(), 250));
      }
    };

    pump();
  });

  await flush(true);

  summary = summarize(users);
  const resolutionRate = summary.total > 0 ? summary.Resolved / summary.total : 0;
  return {
    users,
    summary,
    attempted: queue.length,
    resolved,
    failed,
    shouldFallback: resolutionRate < TARGET_RESOLUTION_RATE,
    telemetry: serializeTelemetry(telemetry)
  };
}
