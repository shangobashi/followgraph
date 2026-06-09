const total = Number.parseInt(process.argv[2] || "7500", 10);
const concurrency = Number.parseInt(process.argv[3] || "48", 10);
const latencyMs = Number.parseInt(process.argv[4] || "350", 10);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index] || 0;
}

async function main() {
  const startedAt = performance.now();
  let cursor = 0;
  let active = 0;
  let completed = 0;
  const latencies = [];

  await new Promise((resolve) => {
    const pump = () => {
      while (active < concurrency && cursor < total) {
        cursor += 1;
        active += 1;
        const sample = Math.max(80, latencyMs * (0.55 + Math.random() * 1.2));
        latencies.push(sample);
        setTimeout(() => {
          active -= 1;
          completed += 1;
          if (completed >= total) resolve();
          else pump();
        }, sample);
      }
    };

    pump();
  });

  const elapsedMs = performance.now() - startedAt;
  const profilesPerMinute = total / Math.max(elapsedMs / 60000, 1 / 60);
  const baselineMs = total * 1800 / 20;
  const improvement = 1 - elapsedMs / baselineMs;

  console.log(
    JSON.stringify(
      {
        total,
        concurrency,
        assumedMedianLatencyMs: latencyMs,
        elapsedMs: Math.round(elapsedMs),
        profilesPerMinute: Math.round(profilesPerMinute),
        p50LatencyMs: Math.round(percentile(latencies, 0.5)),
        p90LatencyMs: Math.round(percentile(latencies, 0.9)),
        baselineHelperTabMs: Math.round(baselineMs),
        projectedImprovementPct: Math.round(improvement * 1000) / 10
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
