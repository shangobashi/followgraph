export type ActivityCategory = "Active" | "Dormant" | "Inactive" | "Unknown";

export interface User {
  username: string;
  displayName: string;
  profileUrl: string;
  lastActivityISO: string | null;
}

export interface ClassifiedUser extends User {
  category: ActivityCategory;
  daysSince: number | null;
}

export interface ScanSummary {
  total: number;
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
