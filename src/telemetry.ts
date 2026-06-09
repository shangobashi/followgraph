export type TelemetryMetric =
  | "scan"
  | "apiDiscovery"
  | "apiResolve"
  | "domResolve"
  | "storageFlush"
  | "jobPersist";

export interface MetricTiming {
  metric: TelemetryMetric;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

export interface RunTelemetry {
  startedAt: number;
  updatedAt: number;
  timings: Record<TelemetryMetric, MetricTiming>;
  apiResolved: number;
  domResolved: number;
  failed: number;
  rateLimited: number;
  profilesPerMinute: number;
}

const metrics: TelemetryMetric[] = ["scan", "apiDiscovery", "apiResolve", "domResolve", "storageFlush", "jobPersist"];

export function createTelemetry(): RunTelemetry {
  const now = Date.now();
  const timings = Object.fromEntries(
    metrics.map((metric) => [
      metric,
      {
        metric,
        count: 0,
        totalMs: 0,
        minMs: Number.POSITIVE_INFINITY,
        maxMs: 0
      }
    ])
  ) as Record<TelemetryMetric, MetricTiming>;

  return {
    startedAt: now,
    updatedAt: now,
    timings,
    apiResolved: 0,
    domResolved: 0,
    failed: 0,
    rateLimited: 0,
    profilesPerMinute: 0
  };
}

export function recordTiming(telemetry: RunTelemetry, metric: TelemetryMetric, elapsedMs: number) {
  const timing = telemetry.timings[metric];
  timing.count += 1;
  timing.totalMs += elapsedMs;
  timing.minMs = Math.min(timing.minMs, elapsedMs);
  timing.maxMs = Math.max(timing.maxMs, elapsedMs);
  telemetry.updatedAt = Date.now();
}

export async function time<T>(telemetry: RunTelemetry, metric: TelemetryMetric, fn: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    recordTiming(telemetry, metric, performance.now() - startedAt);
  }
}

export function markResolved(telemetry: RunTelemetry, source: "api" | "dom" | "failed" | "rateLimited", completed: number) {
  if (source === "api") telemetry.apiResolved += 1;
  if (source === "dom") telemetry.domResolved += 1;
  if (source === "failed") telemetry.failed += 1;
  if (source === "rateLimited") telemetry.rateLimited += 1;

  const elapsedMinutes = Math.max((Date.now() - telemetry.startedAt) / 60000, 1 / 60);
  telemetry.profilesPerMinute = completed / elapsedMinutes;
  telemetry.updatedAt = Date.now();
}

export function serializeTelemetry(telemetry: RunTelemetry) {
  return {
    ...telemetry,
    timings: Object.fromEntries(
      Object.entries(telemetry.timings).map(([key, value]) => [
        key,
        {
          ...value,
          minMs: Number.isFinite(value.minMs) ? value.minMs : 0,
          avgMs: value.count > 0 ? value.totalMs / value.count : 0
        }
      ])
    )
  };
}
