import type { User } from "./types";

export class UserStore {
  private map = new Map<string, User>();

  add(users: User[]) {
    for (const u of users) {
      const key = u.username.toLowerCase();
      const prev = this.map.get(key);
      if (!prev) {
        this.map.set(key, u);
        continue;
      }

      const preferNextActivity =
        !prev.lastActivityISO ||
        (u.lastActivityISO &&
          (u.activitySource === "followingApi" || u.activitySource === "apiTimeline") &&
          prev.activitySource !== "apiTimeline");

      this.map.set(key, {
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
