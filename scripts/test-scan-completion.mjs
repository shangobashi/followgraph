import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outdir = await mkdtemp(join(tmpdir(), "followgraph-scan-completion-"));
const outfile = join(outdir, "scanCompletion.mjs");

try {
  await build({
    entryPoints: ["src/scanCompletion.ts"],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "silent"
  });

  const {
    CURSOR_BACKED_WAIT_IDLE_ROUNDS,
    NO_SPINNER_END_IDLE_ROUNDS,
    PROVEN_END_IDLE_ROUNDS,
    SCAN_MAX_IDLE_ROUNDS,
    UNKNOWN_LOADING_WAIT_IDLE_ROUNDS,
    decideScanIdle
  } = await import(pathToFileURL(outfile).href);

  assert.ok(
    SCAN_MAX_IDLE_ROUNDS > UNKNOWN_LOADING_WAIT_IDLE_ROUNDS,
    "scroll loop idle cap must be higher than the slowest scan-completion decision threshold"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: PROVEN_END_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: true,
      pagination: {
        responseCount: 5,
        hasBottomCursor: false,
        lastResponseAt: Date.now(),
        lastBottomCursorAt: Date.now() - 1000,
        lastUserCount: 20,
        lastNewUserCount: 20,
        uniqueUserCount: 7440
      }
    }),
    "complete",
    "terminal Following response should complete even if X leaves a spinner"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: PROVEN_END_IDLE_ROUNDS + 20,
      extractedTotal: 3000,
      loading: true,
      pagination: {
        responseCount: 5,
        hasBottomCursor: true,
        lastResponseAt: Date.now(),
        lastBottomCursorAt: Date.now(),
        lastUserCount: 20,
        lastNewUserCount: 20,
        uniqueUserCount: 3000
      }
    }),
    "continue",
    "mid-list spinner with a bottom cursor must not complete"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: CURSOR_BACKED_WAIT_IDLE_ROUNDS,
      extractedTotal: 3000,
      loading: true,
      pagination: {
        responseCount: 5,
        hasBottomCursor: true,
        lastResponseAt: Date.now(),
        lastBottomCursorAt: Date.now(),
        lastUserCount: 20,
        lastNewUserCount: 20,
        uniqueUserCount: 3000
      }
    }),
    "complete",
    "long cursor-backed idle with extracted users should complete instead of trapping the user in resume"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: PROVEN_END_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: true,
      pagination: {
        responseCount: 6,
        hasBottomCursor: true,
        lastResponseAt: Date.now(),
        lastBottomCursorAt: Date.now(),
        lastUserCount: 0,
        lastNewUserCount: 0,
        uniqueUserCount: 7440
      }
    }),
    "complete",
    "empty or repeated cursor page should be treated as terminal"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: NO_SPINNER_END_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: false,
      pagination: {
        responseCount: 5,
        hasBottomCursor: true,
        lastResponseAt: Date.now(),
        lastBottomCursorAt: Date.now(),
        lastUserCount: 20,
        lastNewUserCount: 20,
        uniqueUserCount: 7440
      }
    }),
    "complete",
    "no-spinner sustained idle can complete"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: UNKNOWN_LOADING_WAIT_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: true,
      pagination: null
    }),
    "complete",
    "unknown spinner state with extracted users should eventually complete instead of trapping the user"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: UNKNOWN_LOADING_WAIT_IDLE_ROUNDS,
      extractedTotal: 0,
      loading: true,
      pagination: null
    }),
    "recoverable_stall",
    "blank loading state should remain recoverable"
  );

  console.log("scan completion decisions passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
