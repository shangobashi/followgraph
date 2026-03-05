import type { User } from "./types";

export class UserStore {
  private map = new Map<string, User>();

  add(users: User[]) {
    for (const u of users) {
      const prev = this.map.get(u.username);
      if (!prev) {
        this.map.set(u.username, u);
        continue;
      }

      this.map.set(u.username, {
        username: u.username,
        displayName: prev.displayName || u.displayName,
        profileUrl: prev.profileUrl || u.profileUrl,
        lastActivityISO: prev.lastActivityISO || u.lastActivityISO
      });
    }
  }

  size() {
    return this.map.size;
  }

  values() {
    return Array.from(this.map.values());
  }
}
