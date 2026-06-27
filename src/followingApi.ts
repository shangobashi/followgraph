import type { ActivitySource, ProfileState, User } from "./types";
import type { FollowingPaginationState } from "./scanCompletion";

type RecordLike = Record<string, unknown>;

export interface CapturedGraphQLOperation {
  name: string;
  queryId: string;
  url: string;
  variables: unknown;
  features: unknown;
}

interface CapturedApiResponse {
  url: string;
  body: unknown;
  status?: number;
  elapsedMs?: number;
}

declare global {
  interface Window {
    __FOLLOWGRAPH_API_CAPTURE_READY__?: boolean;
  }
}

const seenUrls = new Set<string>();
const capturedResponses: CapturedApiResponse[] = [];
const capturedOperations = new Map<string, CapturedGraphQLOperation>();
const followingPaginationState: FollowingPaginationState = {
  responseCount: 0,
  hasBottomCursor: null,
  lastResponseAt: null,
  lastBottomCursorAt: null,
  lastUserCount: null,
  lastNewUserCount: null,
  uniqueUserCount: 0
};
const followingPaginationUsernames = new Set<string>();
let listenerReady = false;

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProbablyHandle(value: string) {
  return /^[A-Za-z0-9_]{1,15}$/.test(value);
}

function isXGraphQLUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    if (!["x.com", "twitter.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return false;
    return url.pathname.toLowerCase().includes("/i/api/graphql/");
  } catch {
    return false;
  }
}

function isFollowingApiUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const name = url.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
    return isXGraphQLUrl(urlString) && (name.includes("following") || name.includes("followers"));
  } catch {
    return false;
  }
}

function findBottomCursor(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const cursorType = String(value.cursorType ?? value.cursor_type ?? "").toLowerCase();
  const entryId = String(value.entryId ?? value.entry_id ?? "").toLowerCase();
  const itemType = String(value.__typename ?? value.type ?? "").toLowerCase();
  const cursorValue =
    typeof value.value === "string" ? value.value : typeof value.cursor === "string" ? value.cursor : null;

  if ((cursorType === "bottom" || entryId.includes("cursor-bottom")) && (cursorValue || itemType.includes("cursor"))) {
    return cursorValue ?? "";
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const cursor = findBottomCursor(item);
        if (cursor !== null) return cursor;
      }
      continue;
    }

    const cursor = findBottomCursor(child);
    if (cursor !== null) return cursor;
  }

  return null;
}

function rememberFollowingPagination(body: unknown) {
  const bottomCursor = findBottomCursor(body);
  const users = collectUsers(body);
  let newUserCount = 0;
  for (const username of users.keys()) {
    if (followingPaginationUsernames.has(username)) continue;
    followingPaginationUsernames.add(username);
    newUserCount += 1;
  }

  followingPaginationState.responseCount += 1;
  followingPaginationState.hasBottomCursor = bottomCursor !== null;
  followingPaginationState.lastResponseAt = Date.now();
  if (bottomCursor !== null) followingPaginationState.lastBottomCursorAt = followingPaginationState.lastResponseAt;
  followingPaginationState.lastUserCount = users.size;
  followingPaginationState.lastNewUserCount = newUserCount;
  followingPaginationState.uniqueUserCount = followingPaginationUsernames.size;
}

function parseJsonParam(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function operationFromUrl(urlString: string): CapturedGraphQLOperation | null {
  try {
    const url = new URL(urlString);
    const parts = url.pathname.split("/").filter(Boolean);
    const queryId = parts.at(-2) || "";
    const name = parts.at(-1) || "";
    if (!queryId || !name || !isXGraphQLUrl(urlString)) return null;
    return {
      name,
      queryId,
      url: urlString,
      variables: parseJsonParam(url.searchParams, "variables"),
      features: parseJsonParam(url.searchParams, "features")
    };
  } catch {
    return null;
  }
}

function rememberOperation(url: string) {
  const operation = operationFromUrl(url);
  if (!operation) return;
  capturedOperations.set(operation.name, operation);
}

function restIdFromRecord(record: RecordLike) {
  const restId = record.rest_id ?? record.id_str;
  return typeof restId === "string" && restId ? restId : null;
}

function displayNameFromLegacy(legacy: RecordLike) {
  const name = typeof legacy.name === "string" ? legacy.name : "";
  return cleanText(name);
}

function usernameFromLegacy(legacy: RecordLike) {
  const screenName = typeof legacy.screen_name === "string" ? legacy.screen_name : "";
  return isProbablyHandle(screenName) ? screenName : "";
}

function activityFromLegacy(legacy: RecordLike) {
  const status = isRecord(legacy.status) ? legacy.status : null;
  const createdAt = typeof status?.created_at === "string" ? status.created_at : null;
  if (!createdAt) return null;

  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function stateFromRecord(record: RecordLike, legacy: RecordLike): ProfileState {
  const typename = String(record.__typename ?? record.reason ?? "").toLowerCase();
  if (typename.includes("suspend")) return "suspended";
  if (typename.includes("unavailable") || typename.includes("tombstone") || typename.includes("notfound")) return "unavailable";
  if (legacy.protected === true) return "protected";
  if (typeof legacy.statuses_count === "number" && legacy.statuses_count <= 0) return "noPosts";
  return activityFromLegacy(legacy) ? "posts" : "unknown";
}

function noteForState(state: ProfileState) {
  if (state === "protected") return "Resolved from following API: protected profile.";
  if (state === "suspended") return "Resolved from following API: suspended profile.";
  if (state === "unavailable") return "Resolved from following API: unavailable profile.";
  if (state === "noPosts") return "Resolved from following API: no public posts.";
  if (state === "posts") return "Resolved from following API embedded status.";
  return null;
}

function collectUsers(value: unknown, out = new Map<string, User>()) {
  if (!isRecord(value)) return out;

  const legacy = isRecord(value.legacy) ? value.legacy : null;
  if (legacy) {
    const username = usernameFromLegacy(legacy);
    if (username) {
      const profileState = stateFromRecord(value, legacy);
      const lastActivityISO = activityFromLegacy(legacy);
      const resolved = Boolean(lastActivityISO) || profileState !== "unknown";
      const source: ActivitySource = lastActivityISO || resolved ? "followingApi" : "none";

      out.set(username.toLowerCase(), {
        restId: restIdFromRecord(value),
        username,
        displayName: displayNameFromLegacy(legacy),
        profileUrl: new URL(`/${username}`, location.origin).toString(),
        lastActivityISO,
        activitySource: source,
        profileState,
        enrichmentStatus: resolved ? "done" : "not_started",
        lastCheckedAt: resolved ? Date.now() : null,
        note: noteForState(profileState)
      });
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectUsers(item, out);
      continue;
    }

    collectUsers(child, out);
  }

  return out;
}

function currentFollowingApiUrls() {
  const pending = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter(isFollowingApiUrl)
    .filter((url) => !seenUrls.has(url))
    .slice(-16);

  for (const url of pending) {
    seenUrls.add(url);
    rememberOperation(url);
  }

  return pending;
}

function currentGraphQLApiUrls() {
  const pending = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter(isXGraphQLUrl)
    .filter((url) => !seenUrls.has(url))
    .slice(-24);

  for (const url of pending) {
    seenUrls.add(url);
    rememberOperation(url);
  }

  return pending;
}

function rememberCapturedResponse(payload: CapturedApiResponse) {
  if (!payload.url || !isXGraphQLUrl(payload.url)) return;
  rememberOperation(payload.url);
  if (isFollowingApiUrl(payload.url)) rememberFollowingPagination(payload.body);
  capturedResponses.push(payload);
  if (capturedResponses.length > 120) capturedResponses.splice(0, capturedResponses.length - 120);
}

export function installFollowingApiCapture() {
  if (listenerReady) return;
  listenerReady = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; type?: string; payload?: CapturedApiResponse };
    if (data?.source !== "followgraph" || data.type !== "x-api-response" || !data.payload) return;
    rememberCapturedResponse(data.payload);
  });

  if (window.__FOLLOWGRAPH_API_CAPTURE_READY__) return;
  window.__FOLLOWGRAPH_API_CAPTURE_READY__ = true;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("pageCapture.js");
  script.async = false;
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

export function getCapturedGraphQLOperation(name: string) {
  return capturedOperations.get(name) ?? null;
}

export function getFollowingPaginationState(): FollowingPaginationState {
  return { ...followingPaginationState };
}

export async function parseFollowingApiUsers(): Promise<User[]> {
  const users = new Map<string, User>();

  for (const payload of capturedResponses.splice(0, capturedResponses.length)) {
    if (isFollowingApiUrl(payload.url)) collectUsers(payload.body, users);
  }

  const urls = currentFollowingApiUrls();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return;
        const body = await response.json();
        rememberFollowingPagination(body);
        collectUsers(body, users);
      } catch {
        // Replay can fail for internal API responses; page-world capture remains the primary path.
      }
    })
  );

  return Array.from(users.values());
}

export async function parseCapturedApiUsers(): Promise<User[]> {
  const users = new Map<string, User>();

  for (const payload of capturedResponses.splice(0, capturedResponses.length)) {
    if (isXGraphQLUrl(payload.url)) collectUsers(payload.body, users);
  }

  const urls = currentGraphQLApiUrls();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return;
        const body = await response.json();
        collectUsers(body, users);
      } catch {
        // Some internal API URLs are not replayable; page-world capture remains the primary path.
      }
    })
  );

  return Array.from(users.values());
}
