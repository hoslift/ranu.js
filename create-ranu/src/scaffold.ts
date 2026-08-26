import fs from 'node:fs';
import path from 'node:path';
import type { ScaffoldOptions, ScaffoldResult } from './types.js';
import { validateProjectName, validateTargetDirectory } from './validator.js';
import { detectPackageManager, runInstall } from './package-manager.js';
import { initGit } from './git.js';
import { generateTemplateFiles } from './template.js';

/**
 * Scaffolds a new, canonical Ranu.js project.
 *
 * @param options - Options controlling destination path, project name, package manager, and setup flags.
 * @returns Object describing the result of project scaffolding.
 */
export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const dirValidation = validateTargetDirectory(options.projectPath, {
    force: options.force,
    cwd: options.cwd,
  });

  if (!dirValidation.valid) {
    return {
      success: false,
      projectPath: dirValidation.resolvedPath,
      projectName: options.projectName ?? path.basename(dirValidation.resolvedPath),
      packageManager: options.packageManager ?? 'npm',
      filesCreated: [],
      error: dirValidation.error ?? 'Invalid target directory',
    };
  }

  const projectPath = dirValidation.resolvedPath;
  const inferredName = path.basename(projectPath);
  const projectName = options.projectName ?? inferredName;

  const nameValidation = validateProjectName(projectName);
  if (!nameValidation.valid) {
    return {
      success: false,
      projectPath,
      projectName,
      packageManager: options.packageManager ?? 'npm',
      filesCreated: [],
      error: `Invalid project name: ${nameValidation.errors.join(' ')}`,
    };
  }

  const pm = options.packageManager ?? detectPackageManager();
  const templateFiles = generateTemplateFiles(projectName, pm);
  const filesCreated: string[] = [];

  try {
    fs.mkdirSync(projectPath, { recursive: true });

    for (const [relPath, content] of Object.entries(templateFiles)) {
      const fullPath = path.join(projectPath, relPath);
      const parentDir = path.dirname(fullPath);
      fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      filesCreated.push(relPath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      projectPath,
      projectName,
      packageManager: pm,
      filesCreated,
      error: `Failed to write template files: ${msg}`,
    };
  }

  let gitStatus: 'initialized' | 'skipped' | 'failed' = 'skipped';
  if (options.git === true) {
    try {
      const initialized = initGit(projectPath);
      gitStatus = initialized ? 'initialized' : 'failed';
    } catch {
      gitStatus = 'failed';
    }
  }

  let installStatus: 'installed' | 'skipped' | 'failed' = 'skipped';
  if (options.install === true) {
    try {
      const installed = runInstall(pm, projectPath, options.quiet);
      installStatus = installed ? 'installed' : 'failed';
    } catch {
      installStatus = 'failed';
    }
  }

  return {
    success: true,
    projectPath,
    projectName,
    packageManager: pm,
    filesCreated,
    gitStatus,
    installStatus,
  };
}
