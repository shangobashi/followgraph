import type { User } from "./types";

export class UserStore {
  private map = new Map<string, User>();

  constructor(users: User[] = []) {
    this.add(users);
  }

  add(users: User[]) {
    let changed = 0;
    for (const u of users) {
      if (this.addOne(u)) changed += 1;
    }
    return changed;
  }

  addOne(u: User) {
    const key = u.username.toLowerCase();
    const prev = this.map.get(key);
    if (!prev) {
      this.map.set(key, u);
      return true;
    }

    const preferNextActivity =
      !prev.lastActivityISO ||
      (u.lastActivityISO &&
        (u.activitySource === "followingApi" || u.activitySource === "apiTimeline") &&
        prev.activitySource !== "apiTimeline");

    const next: User = {
      restId: prev.restId || u.restId || null,
      username: prev.username || u.username,
      displayName: prev.displayName || u.displayName,
      profileUrl: prev.profileUrl || u.profileUrl,
      lastActivityISO: preferNextActivity ? u.lastActivityISO : prev.lastActivityISO,
      activitySource: preferNextActivity ? u.activitySource : prev.activitySource || u.activitySource,
      profileState: u.profileState && u.profileState !== "unknown" ? u.profileState : prev.profileState || u.profileState,
      enrichmentStatus: u.enrichmentStatus === "done" ? u.enrichmentStatus : prev.enrichmentStatus || u.enrichmentStatus,
      lastCheckedAt: u.lastCheckedAt || prev.lastCheckedAt,
      note: u.note || prev.note,
      unfollowedAt: prev.unfollowedAt || u.unfollowedAt
    };

    if (
      next.restId === (prev.restId ?? null) &&
      next.username === prev.username &&
      next.displayName === prev.displayName &&
      next.profileUrl === prev.profileUrl &&
      next.lastActivityISO === prev.lastActivityISO &&
      next.activitySource === prev.activitySource &&
      next.profileState === prev.profileState &&
      next.enrichmentStatus === prev.enrichmentStatus &&
      next.lastCheckedAt === prev.lastCheckedAt &&
      next.note === prev.note &&
      next.unfollowedAt === prev.unfollowedAt
    ) {
      return false;
    }

    this.map.set(key, next);
    return true;
  }

  size() {
    return this.map.size;
  }

  values() {
    return Array.from(this.map.values());
  }
}
