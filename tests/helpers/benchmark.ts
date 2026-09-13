import os from 'node:os';

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
  medianMemoryMb: number;
  metadata: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuModel: string;
    totalMemoryGb: number;
    timestamp: string;
  };
}

/**
 * Reusable benchmark runner with statistics calculation (median, variance, standard deviation).
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

  for (let i = 0; i < iterations; i++) {
    const startMemory = process.memoryUsage().heapUsed;
    const start = performance.now();
    await fn(i);
    const duration = performance.now() - start;
    const endMemory = process.memoryUsage().heapUsed;

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

  const median =
    durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
      : durations[Math.floor(durations.length / 2)];

  const medianMem =
    memories.length % 2 === 0
      ? (memories[memories.length / 2 - 1] + memories[memories.length / 2]) / 2
      : memories[Math.floor(memories.length / 2)];

  return {
    name,
    fixture,
    iterations,
    warmupIterations,
    medianMs: Number(median.toFixed(2)),
    meanMs: Number(mean.toFixed(2)),
    varianceMs: Number(variance.toFixed(2)),
    stdDevMs: Number(stdDev.toFixed(2)),
    minMs: Number(durations[0].toFixed(2)),
    maxMs: Number(durations[durations.length - 1].toFixed(2)),
    medianMemoryMb: Number(medianMem.toFixed(2)),
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
