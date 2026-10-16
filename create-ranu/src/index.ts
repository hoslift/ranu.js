export const SCAFFOLDER_VERSION = '0.2.0';

export { scaffoldProject } from './scaffold.js';
export { validateProjectName, validateTargetDirectory } from './validator.js';
export {
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
} from './package-manager.js';
export { generateTemplateFiles, type GenerateTemplateOptions } from './template.js';
export { initGit, isGitInstalled, isInsideGitWorkTree } from './git.js';

export type {
  PackageManager,
  TemplateName,
  ScaffoldOptions,
  ScaffoldResult,
  ValidationResult,
} from './types.js';

