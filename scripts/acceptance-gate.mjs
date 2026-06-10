import fs from "node:fs";

const reportPath = process.argv[2] || "reports/latest.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const minResolutionRate = Number(report.thresholds?.minResolutionRate ?? 0.9);
const maxElapsedMs = Number(report.thresholds?.maxElapsedMs ?? 90 * 60000);
const failureReasons = [];

if (Number(report.resolutionRate ?? 0) < minResolutionRate) failureReasons.push("resolution-rate-below-threshold");
if (Number(report.elapsedMs ?? Number.POSITIVE_INFINITY) > maxElapsedMs) failureReasons.push("elapsed-time-above-threshold");
if (Number(report.totalAccounts ?? 0) < 7500) failureReasons.push("total-accounts-below-7500");

const passed = failureReasons.length === 0;
console.log(
  JSON.stringify(
    {
      reportPath,
      passed,
      resolutionRate: report.resolutionRate,
      elapsedMs: report.elapsedMs,
      totalAccounts: report.totalAccounts,
      failureReasons
    },
    null,
    2
  )
);

if (!passed) process.exit(1);
