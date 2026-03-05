import type { ProfileActivityResult, UnfollowResult } from "./types";

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

function currentUsername(fallback = "") {
  return location.pathname.split("/").filter(Boolean)[0] || fallback;
}

async function waitForSignal(timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (document.querySelector("article time[datetime]")) return;

    const text = pageText();
    if (
      text.includes("posts are protected") ||
      text.includes("account suspended") ||
      text.includes("hasn't posted") ||
      text.includes("hasn’t posted") ||
      text.includes("no posts yet") ||
      text.includes("when they do, their posts will show up here") ||
      text.includes("this account doesn't exist") ||
      text.includes("this account doesn’t exist")
    ) {
      return;
    }

    await sleep(250);
  }
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

export async function extractProfileActivity(expectedUsername?: string): Promise<ProfileActivityResult> {
  await waitForSignal();

  const username = currentUsername(expectedUsername || "");
  const text = pageText();

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

  if (text.includes("this account doesn't exist") || text.includes("this account doesn’t exist")) {
    return {
      username,
      lastActivityISO: null,
      activitySource: "none",
      profileState: "unavailable",
      note: "Account unavailable."
    };
  }

  const latestTime = findLatestTimelineTime();
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
    text.includes("hasn’t posted") ||
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
