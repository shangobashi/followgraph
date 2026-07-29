import type { User } from "./types";
import { PROFILE_LINK_SELECTOR, SKIP_USERNAMES, USER_CELL_SELECTORS, isProbablyHandle } from "./selectors";

const parsedCellCache = new WeakMap<Element, User | null>();
const displayNameCache = new WeakMap<Element, string>();
const profileCache = new WeakMap<Element, { username: string | null; href: string | null }>();

function cleanText(s?: string | null) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function extractUsernameFromHref(href: string): string | null {
  const m = href.match(/^\/([^/?]+)(?:\?.*)?$/);
  return m ? m[1] : null;
}

function pickDisplayName(root: Element): string {
  const cached = displayNameCache.get(root);
  if (cached !== undefined) return cached;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = cleanText(current.textContent);
    if (text && !text.startsWith("@") && text.length >= 2) {
      displayNameCache.set(root, text);
      return text;
    }
    current = walker.nextNode();
  }

  const spans = Array.from(root.querySelectorAll('div[dir="ltr"] span, span'));
  const texts = spans.map((s) => cleanText(s.textContent)).filter(Boolean);

  const nonHandle = texts.find((t) => !t.startsWith("@") && t.length >= 2);
  if (nonHandle) {
    displayNameCache.set(root, nonHandle);
    return nonHandle;
  }

  const first = texts[0] || "";
  const displayName = first.startsWith("@") ? first.slice(1) : first;
  displayNameCache.set(root, displayName);
  return displayName;
}

function findProfile(root: Element): { username: string | null; href: string | null } {
  const cached = profileCache.get(root);
  if (cached) return cached;

  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(PROFILE_LINK_SELECTOR));
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const u = extractUsernameFromHref(href);
    if (!u) continue;
    if (href.includes("/status/")) continue;
    if (SKIP_USERNAMES.has(u)) continue;
    if (!isProbablyHandle(u)) continue;
    const profile = { username: u, href };
    profileCache.set(root, profile);
    return profile;
  }
  const empty = { username: null, href: null };
  profileCache.set(root, empty);
  return empty;
}

function getVisibleCards(): Element[] {
  for (const sel of USER_CELL_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

function parseCard(card: Element): User | null {
  const cached = parsedCellCache.get(card);
  if (cached !== undefined) return cached;

  const { username, href } = findProfile(card);
  if (!username) {
    parsedCellCache.set(card, null);
    return null;
  }

  const displayName = pickDisplayName(card);
  const profileUrl = new URL(href || `/${username}`, location.origin).toString();

  const timeEl = card.querySelector("time[datetime]");
  const lastActivityISO = (timeEl as HTMLTimeElement | null)?.getAttribute("datetime") || null;
  const user = { username, displayName, profileUrl, lastActivityISO };
  parsedCellCache.set(card, user);
  return user;
}

function userCellsFromNode(node: Node): Element[] {
  if (!(node instanceof Element)) return [];

  const userCells: Element[] = [];
  if (node.matches(USER_CELL_SELECTORS[0])) userCells.push(node);
  userCells.push(...Array.from(node.querySelectorAll(USER_CELL_SELECTORS[0])));
  if (userCells.length > 0) return userCells;

  const fallbackSelector = USER_CELL_SELECTORS[1];
  const fallbackCards: Element[] = [];
  if (node.matches(fallbackSelector)) fallbackCards.push(node);
  fallbackCards.push(...Array.from(node.querySelectorAll(fallbackSelector)));
  return fallbackCards;
}

export function processAddedNodes(nodes: Iterable<Node>, sink: (user: User) => void): number {
  let parsed = 0;
  const seen = new Set<Element>();

  for (const node of nodes) {
    for (const card of userCellsFromNode(node)) {
      if (seen.has(card)) continue;
      seen.add(card);
      const user = parseCard(card);
      if (!user) continue;
      sink(user);
      parsed += 1;
    }
  }

  return parsed;
}

export function parseVisibleUsers(): User[] {
  const cards = getVisibleCards();
  const out: User[] = [];

  for (const card of cards) {
    const user = parseCard(card);
    if (user) out.push(user);
  }

  return out;
}
