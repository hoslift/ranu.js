import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export interface BenchmarkIteration {
  iteration: number;
  durationMs: number;
  memoryUsageMb: number;
}

export interface BenchmarkSummary {
  name: string;
  fixture: string;
  iterations: number;
  warmupIterations: number;
  medianMs: number;
  meanMs: number;
  varianceMs: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  medianMemoryMb: number;
  peakRssMb?: number;
  throughputPerSec?: number;
  metadata: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuModel: string;
    totalMemoryGb: number;
    timestamp: string;
  };
}

export interface ThroughputSummary extends BenchmarkSummary {
  totalRequests: number;
  concurrency: number;
  successRate: number;
}

export interface BaselineComparisonResult {
  metric: string;
  currentValue: number;
  baselineValue: number;
  deltaPercent: number;
  isRegression: boolean;
  thresholdPercent: number;
  summary: string;
}

/**
 * Reusable benchmark runner with statistics calculation (median, percentiles, variance, stdDev).
 */
export async function runBenchmark(
  name: string,
  fixture: string,
  fn: (iteration: number) => Promise<void>,
  options: { iterations?: number; warmupIterations?: number } = {},
): Promise<BenchmarkSummary> {
  const { iterations = 5, warmupIterations = 1 } = options;

  for (let w = 0; w < warmupIterations; w++) {
    await fn(-1);
  }

  const results: BenchmarkIteration[] = [];
  let peakRss = 0;

  for (let i = 0; i < iterations; i++) {
    const memBefore = process.memoryUsage();
    const startMemory = memBefore.heapUsed;
    const start = performance.now();
    await fn(i);
    const duration = performance.now() - start;
    const memAfter = process.memoryUsage();
    const endMemory = memAfter.heapUsed;

    if (memAfter.rss > peakRss) {
      peakRss = memAfter.rss;
    }

    results.push({
      iteration: i + 1,
      durationMs: duration,
      memoryUsageMb: Math.max(0, (endMemory - startMemory) / (1024 * 1024)),
    });
  }

  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const memories = results.map((r) => r.memoryUsageMb).sort((a, b) => a - b);

  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  const getPercentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)));
    return arr[idx] ?? 0;
  };

  const median =
    durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1]! + durations[durations.length / 2]!) / 2
      : durations[Math.floor(durations.length / 2)]!;

  const medianMem =
    memories.length % 2 === 0
      ? (memories[memories.length / 2 - 1]! + memories[memories.length / 2]!) / 2
      : memories[Math.floor(memories.length / 2)]!;

  const totalDurationSec = durations.reduce((a, b) => a + b, 0) / 1000;
  const throughput = totalDurationSec > 0 ? Number((iterations / totalDurationSec).toFixed(2)) : 0;

  return {
    name,
    fixture,
    iterations,
    warmupIterations,
    medianMs: Number(median.toFixed(2)),
    meanMs: Number(mean.toFixed(2)),
    varianceMs: Number(variance.toFixed(2)),
    stdDevMs: Number(stdDev.toFixed(2)),
    minMs: Number(durations[0]?.toFixed(2) ?? 0),
    maxMs: Number(durations[durations.length - 1]?.toFixed(2) ?? 0),
    p90Ms: Number(getPercentile(durations, 90).toFixed(2)),
    p95Ms: Number(getPercentile(durations, 95).toFixed(2)),
    p99Ms: Number(getPercentile(durations, 99).toFixed(2)),
    medianMemoryMb: Number(medianMem.toFixed(2)),
    peakRssMb: Number((peakRss / (1024 * 1024)).toFixed(2)),
    throughputPerSec: throughput,
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      totalMemoryGb: Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Run a concurrent throughput benchmark with pooled workers.
 */
export async function runThroughputBenchmark(
  name: string,
  fixture: string,
  requestFn: () => Promise<boolean | void>,
  options: {
    totalRequests?: number;
    concurrency?: number;
    warmupRequests?: number;
  } = {},
): Promise<ThroughputSummary> {
  const { totalRequests = 50, concurrency = 10, warmupRequests = 5 } = options;

  // Warmup requests
  for (let w = 0; w < warmupRequests; w++) {
    try {
      await requestFn();
    } catch {
      // Ignore warmup errors
    }
  }

  let successCount = 0;
  let errorCount = 0;
  const latencies: number[] = [];
  const startMemory = process.memoryUsage().heapUsed;
  const startTime = performance.now();

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < totalRequests) {
      nextIndex++;
      const reqStart = performance.now();
      try {
        const res = await requestFn();
        if (res === false) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      } finally {
        latencies.push(performance.now() - reqStart);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = performance.now() - startTime;
  const endMemory = process.memoryUsage().heapUsed;
  const sorted = latencies.sort((a, b) => a - b);

  const mean = sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1);
  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (sorted.length || 1);
  const stdDev = Math.sqrt(variance);

  const getPercentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)));
    return arr[idx] ?? 0;
  };

  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : sorted[Math.floor(sorted.length / 2)]!;

  const reqPerSec = totalDurationMs > 0 ? (totalRequests / (totalDurationMs / 1000)) : 0;
  const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;

  return {
    name,
    fixture,
    iterations: totalRequests,
    warmupIterations: warmupRequests,
    totalRequests,
    concurrency,
    successRate: Number(successRate.toFixed(2)),
    medianMs: Number(median.toFixed(2)),
    meanMs: Number(mean.toFixed(2)),
    varianceMs: Number(variance.toFixed(2)),
    stdDevMs: Number(stdDev.toFixed(2)),
    minMs: Number(sorted[0]?.toFixed(2) ?? 0),
    maxMs: Number(sorted[sorted.length - 1]?.toFixed(2) ?? 0),
    p90Ms: Number(getPercentile(sorted, 90).toFixed(2)),
    p95Ms: Number(getPercentile(sorted, 95).toFixed(2)),
    p99Ms: Number(getPercentile(sorted, 99).toFixed(2)),
    medianMemoryMb: Number(Math.max(0, (endMemory - startMemory) / (1024 * 1024)).toFixed(2)),
    peakRssMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
    throughputPerSec: Number(reqPerSec.toFixed(2)),
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      totalMemoryGb: Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)),
      timestamp: new Date().toISOString(),
    },
  };
}

export interface FrameworkBaselineReport {
  version: string;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuModel: string;
    totalMemoryGb: number;
  };
  metrics: Record<string, number>;
  thresholds?: {
    maxRegressionPercent?: number;
    maxBundleGzipKb?: number;
    maxBuildDurationMs?: number;
    maxCliStartupMs?: number;
    [key: string]: number | undefined;
  };
  summaries?: Record<string, BenchmarkSummary>;
}

/**
 * Compare two numeric metric values against a threshold percentage.
 */
export function compareMetricWithBaseline(
  metricName: string,
  currentValue: number,
  baselineValue: number,
  maxRegressionPercent: number = 20,
): BaselineComparisonResult {
  const delta = currentValue - baselineValue;
  const deltaPercent = baselineValue > 0 ? (delta / baselineValue) * 100 : 0;
  const isRegression = deltaPercent > maxRegressionPercent;

  return {
    metric: metricName,
    currentValue,
    baselineValue,
    deltaPercent: Number(deltaPercent.toFixed(2)),
    isRegression,
    thresholdPercent: maxRegressionPercent,
    summary: isRegression
      ? `REGRESSION: ${metricName} slowed by ${deltaPercent.toFixed(1)}% (current: ${currentValue}, baseline: ${baselineValue}, threshold: +${maxRegressionPercent}%)`
      : `PASS: ${metricName} changed by ${deltaPercent.toFixed(1)}% (current: ${currentValue}, baseline: ${baselineValue})`,
  };
}

/**
 * Compare current benchmark results with baseline to detect performance regressions (> threshold%).
 */
export function compareWithBaseline(
  current: BenchmarkSummary,
  baseline: BenchmarkSummary,
  maxRegressionPercent: number = 20,
): BaselineComparisonResult {
  return compareMetricWithBaseline(
    `${current.name} (medianMs)`,
    current.medianMs,
    baseline.medianMs,
    maxRegressionPercent,
  );
}

/**
 * Save baseline reports to structured JSON on disk.
 */
export function saveBaselineReport(
  filePath: string,
  baselineData: Record<string, BenchmarkSummary> | FrameworkBaselineReport,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(baselineData, null, 2), 'utf8');
}

/**
 * Load baseline reports from JSON file on disk. Supports both raw BenchmarkSummary dictionaries
 * and top-level FrameworkBaselineReport schemas.
 */
export function loadBaselineReport(
  filePath: string,
): Record<string, BenchmarkSummary> | FrameworkBaselineReport | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
