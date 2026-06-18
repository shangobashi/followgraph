export interface FollowingPaginationState {
  responseCount: number;
  hasBottomCursor: boolean | null;
  lastResponseAt: number | null;
  lastBottomCursorAt: number | null;
  lastUserCount: number | null;
  lastNewUserCount: number | null;
  uniqueUserCount: number;
}

export type ScanIdleDecision = "continue" | "complete" | "recoverable_stall";

export interface ScanIdleInput {
  idleRounds: number;
  extractedTotal: number;
  loading: boolean;
  pagination: FollowingPaginationState | null;
}

export const BLANK_LOADING_STALL_IDLE_ROUNDS = 8;
export const PROVEN_END_IDLE_ROUNDS = 10;
export const NO_SPINNER_END_IDLE_ROUNDS = 18;
export const CURSOR_BACKED_WAIT_IDLE_ROUNDS = 240;
export const UNKNOWN_LOADING_WAIT_IDLE_ROUNDS = 300;
export const SCAN_MAX_IDLE_ROUNDS = UNKNOWN_LOADING_WAIT_IDLE_ROUNDS + 10;

export function decideScanIdle(input: ScanIdleInput): ScanIdleDecision {
  const { idleRounds, extractedTotal, loading, pagination } = input;

  if (loading && extractedTotal <= 0 && idleRounds >= BLANK_LOADING_STALL_IDLE_ROUNDS) {
    return "recoverable_stall";
  }

  if (!loading) {
    return idleRounds >= NO_SPINNER_END_IDLE_ROUNDS ? "complete" : "continue";
  }

  if (pagination && pagination.responseCount > 0) {
    if (pagination.hasBottomCursor === false || pagination.lastNewUserCount === 0) {
      return idleRounds >= PROVEN_END_IDLE_ROUNDS ? "complete" : "continue";
    }

    if (pagination.hasBottomCursor === true) {
      return idleRounds >= CURSOR_BACKED_WAIT_IDLE_ROUNDS ? "complete" : "continue";
    }
  }

  return extractedTotal > 0 && idleRounds >= UNKNOWN_LOADING_WAIT_IDLE_ROUNDS ? "complete" : "continue";
}
