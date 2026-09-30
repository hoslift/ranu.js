import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  type BenchmarkSummary,
  compareWithBaseline,
  saveBaselineReport,
  loadBaselineReport,
} from '../helpers/benchmark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

function createMockSummary(name: string, medianMs: number): BenchmarkSummary {
  return {
    name,
    fixture: 'mock-fixture',
    iterations: 5,
    warmupIterations: 1,
    medianMs,
    meanMs: medianMs,
    varianceMs: 1.5,
    stdDevMs: 1.22,
    minMs: medianMs - 2,
    maxMs: medianMs + 3,
    p90Ms: medianMs + 1,
    p95Ms: medianMs + 2,
    p99Ms: medianMs + 3,
    medianMemoryMb: 12.5,
    throughputPerSec: 150,
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0]?.model || 'unknown',
      totalMemoryGb: 16,
      timestamp: new Date().toISOString(),
    },
  };
}

describe('Phase 30 — Performance Baseline: Regression Gate & Baseline Management', () => {
  it('correctly passes when performance change is within threshold tolerance', () => {
    const baseline = createMockSummary('ssr-render', 100);
    // 10% increase is within 20% threshold
    const current = createMockSummary('ssr-render', 110);

    const result = compareWithBaseline(current, baseline, 20);
    expect(result.isRegression).toBe(false);
    expect(result.deltaPercent).toBe(10);
    expect(result.summary).toContain('PASS');
  });

  it('correctly reports performance improvements as non-regressions', () => {
    const baseline = createMockSummary('build-time', 200);
    // 25% faster
    const current = createMockSummary('build-time', 150);

    const result = compareWithBaseline(current, baseline, 20);
    expect(result.isRegression).toBe(false);
    expect(result.deltaPercent).toBe(-25);
    expect(result.summary).toContain('PASS');
  });

  it('detects and flags regressions exceeding the 20% policy threshold', () => {
    const baseline = createMockSummary('cold-dev-startup', 100);
    // 35% slowdown exceeds 20% threshold
    const current = createMockSummary('cold-dev-startup', 135);

    const result = compareWithBaseline(current, baseline, 20);
    expect(result.isRegression).toBe(true);
    expect(result.deltaPercent).toBe(35);
    expect(result.thresholdPercent).toBe(20);
    expect(result.summary).toContain('REGRESSION');
    expect(result.summary).toContain('slowed by 35.0%');
  });

  it('persists and retrieves baseline reports in structured JSON format with complete metadata', () => {
    const tempFile = path.join(os.tmpdir(), `ranu-bench-test-${Date.now()}.json`);

    try {
      const summaries: Record<string, BenchmarkSummary> = {
        'dev-cold-start': createMockSummary('dev-cold-start', 120),
        'cold-build': createMockSummary('cold-build', 850),
        'ssr-latency': createMockSummary('ssr-latency', 12),
      };

      saveBaselineReport(tempFile, summaries);
      expect(fs.existsSync(tempFile)).toBe(true);

      const loaded = loadBaselineReport(tempFile);
      expect(loaded).toBeDefined();
      expect(loaded!['dev-cold-start']).toBeDefined();
      expect(loaded!['dev-cold-start']!.medianMs).toBe(120);
      expect(loaded!['cold-build']!.medianMs).toBe(850);
      expect(loaded!['ssr-latency']!.medianMs).toBe(12);
      expect(loaded!['ssr-latency']!.metadata.nodeVersion).toBe(process.version);
      expect(loaded!['ssr-latency']!.metadata.platform).toBe(process.platform);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.rmSync(tempFile, { force: true });
      }
    }
  });

  it('handles non-existent baseline file gracefully', () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}.json`);
    expect(loadBaselineReport(nonExistent)).toBeNull();
  });
});
