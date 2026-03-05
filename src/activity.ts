import type { ClassifiedUser, ScanSummary, User } from "./types";

export function daysBetween(nowMs: number, thenMs: number) {
  return Math.floor((nowMs - thenMs) / (1000 * 60 * 60 * 24));
}

function isResolvedProfile(user: Pick<ClassifiedUser, "daysSince" | "enrichmentStatus" | "profileState">) {
  return user.daysSince !== null || (user.enrichmentStatus === "done" && user.profileState !== "unknown");
}

export function classifyUsers(users: User[], now = Date.now()): ClassifiedUser[] {
  return users.map((user) => {
    let category: ClassifiedUser["category"] = "Unknown";
    let daysSince: number | null = null;

    if (user.lastActivityISO) {
      const parsed = Date.parse(user.lastActivityISO);
      if (!Number.isNaN(parsed)) {
        daysSince = daysBetween(now, parsed);
        if (daysSince <= 30) category = "Active";
        else if (daysSince <= 180) category = "Dormant";
        else category = "Inactive";
      }
    }

    return {
      ...user,
      activitySource: user.activitySource ?? (user.lastActivityISO ? "followingCard" : "none"),
      profileState: user.profileState ?? (user.lastActivityISO ? "posts" : "unknown"),
      enrichmentStatus: user.enrichmentStatus ?? (user.lastActivityISO ? "done" : "not_started"),
      lastCheckedAt: user.lastCheckedAt ?? null,
      note: user.note ?? null,
      unfollowedAt: user.unfollowedAt ?? null,
      category,
      daysSince,
      inactiveOver30: daysSince !== null && daysSince > 30
    };
  });
}

export function summarize(classified: ClassifiedUser[]): ScanSummary {
  const summary: ScanSummary = {
    total: classified.length,
    Resolved: 0,
    Over30: 0,
    Active: 0,
    Dormant: 0,
    Inactive: 0,
    Unknown: 0
  };

  for (const user of classified) {
    summary[user.category] += 1;
    if (isResolvedProfile(user)) summary.Resolved += 1;
    if (user.inactiveOver30) summary.Over30 += 1;
  }

  return summary;
}
