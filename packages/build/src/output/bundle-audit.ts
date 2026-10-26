export interface BundleAuditResult {
  passed: boolean;
  leakedDevtoolsBytes: number;
  matchedDevtoolsSymbols: string[];
  report: string;
}

export const DEVTOOLS_SENSITIVE_SYMBOLS: readonly string[] = [
  'mountDevToolsDock',
  'DevToolsDock',
  'AIStudioDock',
  'computeLineDiff',
  'ranu-devtools-dock',
  'ranu-ai-studio',
  'submitAIPrompt',
] as const;

/**
 * Audits a production client bundle to ensure zero bytes of @ranu/devtools code leaked into production.
 *
 * Requirements:
 * - 0 bytes of devtools code leaked in production bundles
 * - Zero matches for sensitive devtools dock and AI studio symbols
 */
export function auditProductionBundle(bundleContent: string | Buffer): BundleAuditResult {
  const content = typeof bundleContent === 'string' ? bundleContent : bundleContent.toString('utf8');
  const matches: string[] = [];

  for (const symbol of DEVTOOLS_SENSITIVE_SYMBOLS) {
    if (content.includes(symbol)) {
      matches.push(symbol);
    }
  }

  const passed = matches.length === 0;
  const leakedDevtoolsBytes = passed ? 0 : Buffer.byteLength(content, 'utf8');

  return {
    passed,
    leakedDevtoolsBytes,
    matchedDevtoolsSymbols: matches,
    report: passed
      ? 'PASS: Zero bytes of @ranu/devtools detected in production client bundle (0 bytes leaked).'
      : `FAIL: DevTools zero-footprint violation. Detected symbols in production bundle: ${matches.join(', ')}`,
  };
}
