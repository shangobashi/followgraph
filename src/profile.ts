import type { ProfileActivityResult, UnfollowResult } from "./types";
import { resolveProfileActivityViaXApi } from "./xapi";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function pageText() {
  return cleanText(document.body?.textContent).toLowerCase();
}

interface ProfileSignal {
  text: string;
  hasTimelineTime: boolean;
  hasTerminalState: boolean;
}

function currentUsername(fallback = "") {
  return location.pathname.split("/").filter(Boolean)[0] || fallback;
}

function hasTerminalProfileState(text: string) {
  return (
    text.includes("posts are protected") ||
    text.includes("account suspended") ||
    text.includes("hasn't posted") ||
    text.includes("no posts yet") ||
    text.includes("when they do, their posts will show up here") ||
    text.includes("this account doesn't exist")
  );
}

function readProfileSignal(): ProfileSignal {
  const hasTimelineTime = Boolean(document.querySelector("article time[datetime]"));
  const text = pageText();
  return {
    text,
    hasTimelineTime,
    hasTerminalState: hasTerminalProfileState(text)
  };
}

async function waitForSignal(timeoutMs = 1800) {
  const startedAt = Date.now();
  let signal = readProfileSignal();

  while (Date.now() - startedAt < timeoutMs) {
    if (signal.hasTimelineTime || signal.hasTerminalState) return signal;

    await sleep(80);
    signal = readProfileSignal();
  }

  return signal;
}

function findLatestTimelineTime() {
  const times = Array.from(document.querySelectorAll<HTMLTimeElement>("article time[datetime]"));

  for (const time of times) {
    const article = time.closest("article");
    const articleText = cleanText(article?.textContent).toLowerCase();
    if (articleText.includes("pinned")) continue;
    return time.getAttribute("datetime");
  }

  return times[0]?.getAttribute("datetime") || null;
}

function findButton(matcher: (text: string) => boolean) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, div[role="button"]'));
  return candidates.find((candidate) => isVisible(candidate) && matcher(cleanText(candidate.textContent)));
}

async function waitFor<T>(factory: () => T | null | undefined, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = factory();
    if (value) return value;
    await sleep(200);
  }

  return null;
}

export async function extractProfileActivity(
  expected?: string | { username: string; restId?: string | null }
): Promise<ProfileActivityResult> {
  const expectedUsername = typeof expected === "string" ? expected : expected?.username;
  const apiInput =
    typeof expected === "string"
      ? expected || currentUsername("")
      : { username: expected?.username || currentUsername(""), restId: expected?.restId ?? null };
  const apiResult = await resolveProfileActivityViaXApi(apiInput).catch(() => null);
  if (apiResult && apiResult.profileState !== "unknown") {
    return apiResult;
  }

  let signal = await waitForSignal();

  const username = currentUsername(expectedUsername || "");
  let text = signal.text;

  if (text.includes("posts are protected")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "protected",
      note: "Posts are protected."
    };
  }

  if (text.includes("account suspended")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "suspended",
      note: "Account suspended."
    };
  }

  if (text.includes("this account doesn't exist")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unavailable",
      note: "Account unavailable."
    };
  }

  let latestTime = findLatestTimelineTime();
  if (latestTime) {
    return {
      username,
      lastActivityISO: latestTime,
      activitySource: "profileTimeline",
      profileState: "posts",
      note: null
    };
  }

  if (
    text.includes("hasn't posted") ||
    text.includes("no posts yet") ||
    text.includes("when they do, their posts will show up here")
  ) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "noPosts",
      note: "No public posts found."
    };
  }

  // Give slower profiles one shorter second pass without reverting to the old 12s ceiling.
  signal = await waitForSignal(1800);
  text = signal.text;
  latestTime = findLatestTimelineTime();

  if (text.includes("posts are protected")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "protected",
      note: "Posts are protected."
    };
  }

  if (text.includes("account suspended")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "suspended",
      note: "Account suspended."
    };
  }

  if (text.includes("this account doesn't exist")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unavailable",
      note: "Account unavailable."
    };
  }

  if (latestTime) {
    return {
      username,
      lastActivityISO: latestTime,
      activitySource: "profileTimeline",
      profileState: "posts",
      note: null
    };
  }

  if (
    text.includes("hasn't posted") ||
    text.includes("no posts yet") ||
    text.includes("when they do, their posts will show up here")
  ) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "noPosts",
      note: "No public posts found."
    };
  }

  return {
    username,
    lastActivityISO: null,
    activitySource: "none",
    profileState: "unknown",
    note: "Could not resolve latest activity."
  };
}

export async function unfollowCurrentProfile(expectedUsername?: string): Promise<UnfollowResult> {
  await waitForSignal(7000);

  const username = currentUsername(expectedUsername || "");
  const requestedButton = findButton((text) => text === "Requested");
  if (requestedButton) {
    return {
      username,
      status: "skipped",
      note: "Follow request is pending."
    };
  }

  const followingButton = findButton((text) => text === "Following" || text === "Following ");
  if (!followingButton) {
    const followButton = findButton((text) => text === "Follow" || text === "Follow back");
    if (followButton) {
      return {
        username,
        status: "already_not_following",
        note: "Account is not currently followed."
      };
    }

    return {
      username,
      status: "failed",
      note: "Could not locate the Following button."
    };
  }

  followingButton.click();

  const confirmButton = await waitFor(
    () => findButton((text) => text === "Unfollow" || text === "Unfollow @" || text.startsWith("Unfollow")),
    5000
  );

  if (!confirmButton) {
    return {
      username,
      status: "failed",
      note: "Unfollow confirmation did not appear."
    };
  }

  confirmButton.click();

  const followAfter = await waitFor(
    () => findButton((text) => text === "Follow" || text === "Follow back"),
    6000
  );

  if (followAfter) {
    return {
      username,
      status: "success",
      note: "Account unfollowed."
    };
  }

  return {
    username,
    status: "failed",
    note: "Could not verify the unfollow action."
  };
}
