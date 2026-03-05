export const USER_CELL_SELECTORS = [
  '[data-testid="UserCell"]',
  "article"
];

export const PROFILE_LINK_SELECTOR = 'a[href^="/"]';

export const SKIP_USERNAMES = new Set([
  "i",
  "settings",
  "home",
  "explore",
  "notifications",
  "messages",
  "compose",
  "search",
  "lists",
  "bookmarks"
]);

export function isProbablyHandle(s: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(s);
}
