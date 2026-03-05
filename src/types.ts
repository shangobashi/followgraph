export type ActivityCategory = "Active" | "Dormant" | "Inactive" | "Unknown";
export type ActivitySource = "followingCard" | "profileTimeline" | "none";
export type ProfileState = "posts" | "noPosts" | "protected" | "suspended" | "unavailable" | "unknown";
export type EnrichmentStatus = "not_started" | "done" | "failed";

export interface User {
  username: string;
  displayName: string;
  profileUrl: string;
  lastActivityISO: string | null;
  activitySource?: ActivitySource;
  profileState?: ProfileState;
  enrichmentStatus?: EnrichmentStatus;
  lastCheckedAt?: number | null;
  note?: string | null;
  unfollowedAt?: number | null;
}

export interface ClassifiedUser extends User {
  category: ActivityCategory;
  daysSince: number | null;
  inactiveOver30: boolean;
}

export interface ScanSummary {
  total: number;
  Resolved: number;
  Over30: number;
  Active: number;
  Dormant: number;
  Inactive: number;
  Unknown: number;
}

export interface LastScan {
  timestamp: number;
  users: ClassifiedUser[];
  summary: ScanSummary;
}

export interface Progress {
  rounds: number;
  idleRounds: number;
  extractedTotal: number;
  visibleCells: number;
  progressed: boolean;
  delayMs: number;
  elapsedMs: number;
}

export type StopReason = "idle" | "hardCap" | "maxUsers";

export interface QueuedUser {
  username: string;
  displayName: string;
  profileUrl: string;
}

export type JobType = "enrich" | "unfollow";
export type JobStatus = "running" | "completed" | "error" | "cancelled";
export type JobPhase = "awaiting_navigation" | "processing";

export interface JobState {
  id: string;
  type: JobType;
  status: JobStatus;
  phase: JobPhase | null;
  helperTabId: number | null;
  currentUser: QueuedUser | null;
  queue: QueuedUser[];
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  message: string;
  startedAt: number;
  updatedAt: number;
  thresholdDays: number;
  batchLimit: number;
}

export interface ProfileActivityResult {
  username: string;
  lastActivityISO: string | null;
  activitySource: ActivitySource;
  profileState: ProfileState;
  note: string | null;
}

export type UnfollowResultStatus = "success" | "already_not_following" | "failed" | "skipped";

export interface UnfollowResult {
  username: string;
  status: UnfollowResultStatus;
  note: string;
}

export interface UnfollowAuditEntry {
  username: string;
  displayName: string;
  timestamp: number;
  status: UnfollowResultStatus;
  note: string;
  daysSince: number | null;
}
