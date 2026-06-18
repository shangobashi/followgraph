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
    CURSOR_STALL_IDLE_ROUNDS,
    NO_SPINNER_END_IDLE_ROUNDS,
    PROVEN_END_IDLE_ROUNDS,
    SCAN_MAX_IDLE_ROUNDS,
    UNKNOWN_LOADING_STALL_IDLE_ROUNDS,
    decideScanIdle
  } = await import(pathToFileURL(outfile).href);

  assert.ok(
    SCAN_MAX_IDLE_ROUNDS > UNKNOWN_LOADING_STALL_IDLE_ROUNDS,
    "scroll loop idle cap must be higher than the slowest scan-completion decision threshold"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: PROVEN_END_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: true,
      pagination: { responseCount: 5, hasBottomCursor: false, lastResponseAt: Date.now(), lastBottomCursorAt: Date.now() - 1000 }
    }),
    "complete",
    "terminal Following response should complete even if X leaves a spinner"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: PROVEN_END_IDLE_ROUNDS + 20,
      extractedTotal: 3000,
      loading: true,
      pagination: { responseCount: 5, hasBottomCursor: true, lastResponseAt: Date.now(), lastBottomCursorAt: Date.now() }
    }),
    "continue",
    "mid-list spinner with a bottom cursor must not complete"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: CURSOR_STALL_IDLE_ROUNDS,
      extractedTotal: 3000,
      loading: true,
      pagination: { responseCount: 5, hasBottomCursor: true, lastResponseAt: Date.now(), lastBottomCursorAt: Date.now() }
    }),
    "recoverable_stall",
    "long mid-list cursor stall should pause as recoverable instead of completing"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: NO_SPINNER_END_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: false,
      pagination: { responseCount: 5, hasBottomCursor: true, lastResponseAt: Date.now(), lastBottomCursorAt: Date.now() }
    }),
    "complete",
    "no-spinner sustained idle can complete"
  );

  assert.equal(
    decideScanIdle({
      idleRounds: UNKNOWN_LOADING_STALL_IDLE_ROUNDS,
      extractedTotal: 7440,
      loading: true,
      pagination: null
    }),
    "recoverable_stall",
    "unknown spinner state should not complete without terminal proof"
  );

  console.log("scan completion decisions passed");
} finally {
  await rm(outdir, { recursive: true, force: true });
}
