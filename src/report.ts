import type { ActivitySource, ClassifiedUser, PerformanceTelemetry, ProfileState, ScanReport, ScanSummary } from "./types";

const activitySources: ActivitySource[] = ["followingCard", "followingApi", "apiTimeline", "profileTimeline", "none"];
const profileStates: ProfileState[] = ["posts", "noPosts", "protected", "suspended", "unavailable", "unknown"];

function isResolved(user: ClassifiedUser) {
  return user.daysSince !== null || (user.enrichmentStatus === "done" && user.profileState !== "unknown");
}

function emptySourceCounts() {
  return Object.fromEntries(activitySources.map((source) => [source, 0])) as Record<ActivitySource, number>;
}

function emptyStateCounts() {
  return Object.fromEntries(profileStates.map((state) => [state, 0])) as Record<ProfileState, number>;
}

export function buildScanReport(
  users: ClassifiedUser[],
  summary: ScanSummary,
  timestamp = Date.now(),
  elapsedMs: number | null = null,
  performance: PerformanceTelemetry | undefined = undefined
): ScanReport {
  const resolvedBySource = emptySourceCounts();
  const terminalStates = emptyStateCounts();

  for (const user of users) {
    const source = user.activitySource ?? "none";
    const state = user.profileState ?? "unknown";
    if (isResolved(user)) resolvedBySource[source] += 1;
    terminalStates[state] += 1;
  }

  const successRate = summary.total > 0 ? summary.Resolved / summary.total : 0;
  const elapsedMinutes = elapsedMs && elapsedMs > 0 ? elapsedMs / 60000 : null;

  return {
    timestamp,
    total: summary.total,
    resolved: summary.Resolved,
    unresolved: Math.max(summary.total - summary.Resolved, 0),
    successRate,
    targetResolved90: successRate >= 0.9,
    resolvedBySource,
    terminalStates,
    elapsedMs,
    profilesPerMinute: elapsedMinutes ? summary.Resolved / elapsedMinutes : null,
    performance
  };
}
