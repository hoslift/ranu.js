#!/usr/bin/env node

/**
 * Baseline Report Generator for Ranu.js
 *
 * Runs repeatable performance measurements across CLI, Build, Server, and Bundle Size,
 * and saves the result to benchmarks/baseline.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const benchmarksDir = path.join(root, 'benchmarks');
const baselineFile = path.join(benchmarksDir, 'baseline.json');

console.log('Generating Ranu.js Performance Baseline...');

// 1. Measure CLI cold startup
console.log('-> Measuring CLI cold startup...');
const cliDurations = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const res = spawnSync(process.execPath, [cliBin, '--version'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (res.status === 0) {
    cliDurations.push(performance.now() - start);
  }
}
cliDurations.sort((a, b) => a - b);
const cliMedian = cliDurations[Math.floor(cliDurations.length / 2)] || 0;

// 2. Measure production build duration on fixture
console.log('-> Measuring production build duration...');
const fixtureDir = path.join(root, 'fixtures/build-basic');
const buildDurations = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  const res = spawnSync(process.execPath, [cliBin, 'build', '--clean'], {
    cwd: fixtureDir,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (res.status === 0) {
    buildDurations.push(performance.now() - start);
  }
}
buildDurations.sort((a, b) => a - b);
const buildMedian = buildDurations[Math.floor(buildDurations.length / 2)] || 0;

// 3. Measure static client bundle sizes
console.log('-> Auditing static client bundle sizes...');
const staticAssetsDir = path.join(fixtureDir, '.ranu/build/static');
let totalRawBytes = 0;
let totalGzipBytes = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.css'))) {
      const content = fs.readFileSync(full);
      totalRawBytes += content.length;
      totalGzipBytes += zlib.gzipSync(content).length;
    }
  }
}
walk(staticAssetsDir);

// 4. Construct baseline payload
const baselineReport = {
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    totalMemoryGb: Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)),
  },
  metrics: {
    cliColdStartupMedianMs: Number(cliMedian.toFixed(2)),
    productionBuildColdMedianMs: Number(buildMedian.toFixed(2)),
    clientBundleTotalRawKb: Number((totalRawBytes / 1024).toFixed(2)),
    clientBundleTotalGzipKb: Number((totalGzipBytes / 1024).toFixed(2)),
  },
  thresholds: {
    maxRegressionPercent: 20,
    maxBundleGzipKb: 300,
    maxBuildDurationMs: 15000,
    maxCliStartupMs: 3000,
  },
};

fs.mkdirSync(benchmarksDir, { recursive: true });
fs.writeFileSync(baselineFile, JSON.stringify(baselineReport, null, 2), 'utf8');

console.log(`✓ Baseline report saved to ${baselineFile}`);
console.log(JSON.stringify(baselineReport, null, 2));
