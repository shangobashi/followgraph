import type { ScanSession } from "./types";

export const MIN_FINALIZABLE_SCAN_USERS = 1;

export function scanSessionBlocksJobs(session: ScanSession | null) {
  return session?.status === "running" || session?.status === "recoverable_error" || session?.status === "paused";
}

export function scanSessionCanBeFinalized(session: ScanSession | null) {
  return Boolean(
    session &&
      (session.status === "recoverable_error" || session.status === "paused" || session.status === "running") &&
      Array.isArray(session.users) &&
      session.users.length >= MIN_FINALIZABLE_SCAN_USERS
  );
}
