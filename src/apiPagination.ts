import { getCapturedFollowingOperation, parseFollowingApiPage } from "./followingApi";
import { fetchFollowingPageViaXApi } from "./xapi";
import type { User } from "./types";

const PAGE_SIZE = 100;
const MAX_PAGES = 300;
const MAX_RATE_LIMIT_RETRIES = 5;
const PAGE_DELAY_MS = 90;

export interface FollowingPaginationTelemetry {
  pages: number;
  users: number;
  rateLimits: number;
  retries: number;
  elapsedMs: number;
  complete: boolean;
  error: string | null;
}

export interface FollowingPaginationOptions {
  onPage: (users: User[], telemetry: FollowingPaginationTelemetry) => void;
  onStatus?: (message: string, telemetry: FollowingPaginationTelemetry) => void;
  shouldStop?: () => boolean;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function isRateLimited(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("rate limited") || message.includes("429");
}

function telemetrySnapshot(
  startedAt: number,
  state: Omit<FollowingPaginationTelemetry, "elapsedMs">
): FollowingPaginationTelemetry {
  return {
    ...state,
    elapsedMs: Math.max(0, Date.now() - startedAt)
  };
}

export async function runFollowingApiPagination(opts: FollowingPaginationOptions): Promise<FollowingPaginationTelemetry> {
  const operation = getCapturedFollowingOperation();
  const startedAt = Date.now();
  const state: Omit<FollowingPaginationTelemetry, "elapsedMs"> = {
    pages: 0,
    users: 0,
    rateLimits: 0,
    retries: 0,
    complete: false,
    error: null
  };

  if (!operation) {
    state.error = "Waiting for a Following API operation from X.";
    return telemetrySnapshot(startedAt, state);
  }

  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  while (state.pages < MAX_PAGES && !opts.shouldStop?.()) {
    try {
      const body = await fetchFollowingPageViaXApi(operation, cursor, PAGE_SIZE);
      const page = parseFollowingApiPage(body);
      state.pages += 1;
      state.users += page.users.length;

      const snapshot = telemetrySnapshot(startedAt, state);
      opts.onPage(page.users, snapshot);
      opts.onStatus?.(`API scan page ${state.pages}: ${state.users} profiles captured.`, snapshot);

      if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
        state.complete = true;
        break;
      }

      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
      await sleep(PAGE_DELAY_MS);
    } catch (error) {
      if (!isRateLimited(error)) {
        state.error = error instanceof Error ? error.message : "Following API pagination failed.";
        break;
      }

      state.rateLimits += 1;
      if (state.rateLimits > MAX_RATE_LIMIT_RETRIES) {
        state.error = "X rate limited Following API pagination.";
        break;
      }

      const cooldownMs = Math.min(60_000, 1_500 * 2 ** (state.rateLimits - 1));
      state.retries += 1;
      opts.onStatus?.(`Following API rate limited. Retrying in ${Math.ceil(cooldownMs / 1000)}s.`, telemetrySnapshot(startedAt, state));
      await sleep(cooldownMs);
    }
  }

  if (!state.complete && !state.error && opts.shouldStop?.()) {
    state.error = "Following API pagination stopped.";
  }

  if (!state.complete && !state.error && state.pages >= MAX_PAGES) {
    state.error = "Following API pagination reached its safety page limit.";
  }

  return telemetrySnapshot(startedAt, state);
}
