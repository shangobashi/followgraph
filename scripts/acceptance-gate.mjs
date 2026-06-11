import fs from "node:fs";
import { execSync } from "node:child_process";

const reportPath = process.argv[2] || "reports/latest.json";
const allowSynthetic = process.argv.includes("--allow-synthetic");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const minResolutionRate = Number(report.thresholds?.minResolutionRate ?? 0.9);
const maxElapsedMs = Number(report.thresholds?.maxElapsedMs ?? 90 * 60000);
const currentCommit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
const resolved = Number(report.resolved ?? 0);
const totalAccounts = Number(report.totalAccounts ?? 0);
const recomputedResolutionRate = totalAccounts > 0 ? resolved / totalAccounts : 0;
const failureReasons = [];

if (report.gitCommit !== currentCommit) failureReasons.push("report-commit-does-not-match-head");
if (report.version !== "1.3.2") failureReasons.push("report-version-mismatch");
if (!allowSynthetic && report.mode === "synthetic") failureReasons.push("synthetic-report-not-accepted");
if (!["live", "replay", "synthetic"].includes(String(report.mode))) failureReasons.push("report-mode-invalid");
if (report.pass !== true) failureReasons.push("report-pass-field-not-true");
if (Math.abs(Number(report.resolutionRate ?? 0) - recomputedResolutionRate) > 0.000001) {
  failureReasons.push("resolution-rate-inconsistent");
}
if (recomputedResolutionRate < minResolutionRate) failureReasons.push("resolution-rate-below-threshold");
if (Number(report.elapsedMs ?? Number.POSITIVE_INFINITY) > maxElapsedMs) failureReasons.push("elapsed-time-above-threshold");
if (totalAccounts < 7500) failureReasons.push("total-accounts-below-7500");

const passed = failureReasons.length === 0;
console.log(
  JSON.stringify(
    {
      reportPath,
      currentCommit,
      reportCommit: report.gitCommit,
      passed,
      resolutionRate: recomputedResolutionRate,
      elapsedMs: report.elapsedMs,
      totalAccounts,
      failureReasons
    },
    null,
    2
  )
);

if (!passed) process.exit(1);
