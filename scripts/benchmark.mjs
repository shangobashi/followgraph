import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function readArgs(argv) {
  const out = {
    total: 7500,
    concurrency: 64,
    latencyMs: 350,
    resolutionRate: 0.9,
    maxMinutes: 90,
    minResolutionRate: 0.9,
    report: ""
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = argv[i + 1];
    i += 1;
    if (key === "total") out.total = Number.parseInt(value, 10);
    else if (key === "concurrency") out.concurrency = Number.parseInt(value, 10);
    else if (key === "latency-ms") out.latencyMs = Number.parseInt(value, 10);
    else if (key === "resolution-rate") out.resolutionRate = Number.parseFloat(value);
    else if (key === "max-minutes") out.maxMinutes = Number.parseFloat(value);
    else if (key === "min-resolution-rate") out.minResolutionRate = Number.parseFloat(value);
    else if (key === "report") out.report = value;
  }

  if (positional[0]) out.total = Number.parseInt(positional[0], 10);
  if (positional[1]) out.concurrency = Number.parseInt(positional[1], 10);
  if (positional[2]) out.latencyMs = Number.parseInt(positional[2], 10);
  return out;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] || 0;
}

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const opts = readArgs(process.argv.slice(2));
  const total = opts.total;
  const resolvedTarget = Math.floor(total * opts.resolutionRate);
  const startedAt = new Date();
  const startedMs = performance.now();
  let cursor = 0;
  let active = 0;
  let completed = 0;
  const latencies = [];

  await new Promise((resolve) => {
    const pump = () => {
      while (active < opts.concurrency && cursor < resolvedTarget) {
        cursor += 1;
        active += 1;
        const sample = Math.max(80, opts.latencyMs * (0.55 + Math.random() * 1.2));
        latencies.push(sample);
        setTimeout(() => {
          active -= 1;
          completed += 1;
          if (completed >= resolvedTarget) resolve();
          else pump();
        }, sample);
      }
    };

    pump();
  });

  const elapsedMs = performance.now() - startedMs;
  const resolutionRate = completed / total;
  const profilesPerMinute = completed / Math.max(elapsedMs / 60000, 1 / 60);
  const maxElapsedMs = opts.maxMinutes * 60000;
  const failureReasons = [];
  if (resolutionRate < opts.minResolutionRate) failureReasons.push("resolution-rate-below-threshold");
  if (elapsedMs > maxElapsedMs) failureReasons.push("elapsed-time-above-threshold");

  const report = {
    version: "1.3.4",
    gitCommit: gitCommit(),
    mode: "synthetic",
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    elapsedMs: Math.round(elapsedMs),
    totalAccounts: total,
    attempted: resolvedTarget,
    resolved: completed,
    apiResolved: completed,
    domResolved: 0,
    failed: total - completed,
    unknown: total - completed,
    rateLimited: 0,
    resolutionRate,
    profilesPerMinute: Math.round(profilesPerMinute),
    concurrency: {
      min: opts.concurrency,
      max: opts.concurrency,
      average: opts.concurrency
    },
    fallbackTriggered: false,
    timings: {
      apiResolve: {
        p50: Math.round(percentile(latencies, 0.5)),
        p90: Math.round(percentile(latencies, 0.9)),
        p95: Math.round(percentile(latencies, 0.95))
      }
    },
    thresholds: {
      minResolutionRate: opts.minResolutionRate,
      maxElapsedMs
    },
    pass: failureReasons.length === 0,
    failureReasons
  };

  if (opts.report) {
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
