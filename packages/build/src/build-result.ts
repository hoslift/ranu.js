import type { RanuDiagnostic } from '@ranu/diagnostics';

/** Result object returned by build() orchestration */
export interface BuildResult {
  /** True if the build completed without fatal errors */
  success: boolean;

  /** Unique build identifier for this build run */
  buildId: string;

  /** Absolute path to the finalized build output directory (.ranu/build) */
  outDir: string;

  /** All diagnostics (warnings, errors) collected during the build */
  diagnostics: RanuDiagnostic[];

  /** Build execution duration in milliseconds */
  duration: number;
}
