import type { User } from "./types";
import { PROFILE_LINK_SELECTOR, SKIP_USERNAMES, USER_CELL_SELECTORS, isProbablyHandle } from "./selectors";

function cleanText(s?: string | null) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function extractUsernameFromHref(href: string): string | null {
  const m = href.match(/^\/([^/?]+)(?:\?.*)?$/);
  return m ? m[1] : null;
}

function pickDisplayName(root: Element): string {
  const spans = Array.from(root.querySelectorAll('div[dir="ltr"] span, span'));
  const texts = spans.map((s) => cleanText(s.textContent)).filter(Boolean);

  const nonHandle = texts.find((t) => !t.startsWith("@") && t.length >= 2);
  if (nonHandle) return nonHandle;

  const first = texts[0] || "";
  return first.startsWith("@") ? first.slice(1) : first;
}

function findProfile(root: Element): { username: string | null; href: string | null } {
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(PROFILE_LINK_SELECTOR));
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const u = extractUsernameFromHref(href);
    if (!u) continue;
    if (href.includes("/status/")) continue;
    if (SKIP_USERNAMES.has(u)) continue;
    if (!isProbablyHandle(u)) continue;
    return { username: u, href };
  }
  return { username: null, href: null };
}

function getVisibleCards(): Element[] {
  for (const sel of USER_CELL_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

export function parseVisibleUsers(): User[] {
  const cards = getVisibleCards();
  const out: User[] = [];

  for (const card of cards) {
    const { username, href } = findProfile(card);
    if (!username) continue;

    const displayName = pickDisplayName(card);
    const profileUrl = new URL(href || `/${username}`, location.origin).toString();

    const timeEl = card.querySelector("time[datetime]");
    const lastActivityISO = (timeEl as HTMLTimeElement | null)?.getAttribute("datetime") || null;

    out.push({ username, displayName, profileUrl, lastActivityISO });
  }

  return out;
}
