import type { User } from "./types";

type RecordLike = Record<string, unknown>;

const seenUrls = new Set<string>();

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProbablyHandle(value: string) {
  return /^[A-Za-z0-9_]{1,15}$/.test(value);
}

function isFollowingApiUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    if (!["x.com", "twitter.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return false;
    const path = url.pathname.toLowerCase();
    const name = path.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
    return path.includes("/i/api/graphql/") && (name.includes("following") || name.includes("followers"));
  } catch {
    return false;
  }
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
  const createdAt =
    typeof legacy.created_at === "string"
      ? legacy.created_at
      : typeof legacy.status === "object" && legacy.status && "created_at" in legacy.status
        ? (legacy.status as RecordLike).created_at
        : null;

  if (typeof createdAt !== "string") return null;
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function collectUsers(value: unknown, out = new Map<string, User>()) {
  if (!isRecord(value)) return out;

  const legacy = isRecord(value.legacy) ? value.legacy : null;
  if (legacy) {
    const username = usernameFromLegacy(legacy);
    if (username) {
      out.set(username.toLowerCase(), {
        username,
        displayName: displayNameFromLegacy(legacy),
        profileUrl: new URL(`/${username}`, location.origin).toString(),
        lastActivityISO: activityFromLegacy(legacy)
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
  return performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter(isFollowingApiUrl)
    .filter((url) => {
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    })
    .slice(-16);
}

export async function parseFollowingApiUsers(): Promise<User[]> {
  const urls = currentFollowingApiUrls();
  if (urls.length === 0) return [];

  const users = new Map<string, User>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return;
        collectUsers(await response.json(), users);
      } catch {
        // X can block replaying some internal API responses; DOM extraction remains the fallback.
      }
    })
  );

  return Array.from(users.values());
}
