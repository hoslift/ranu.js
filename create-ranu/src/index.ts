export const SCAFFOLDER_VERSION = '0.2.0';

export { scaffoldProject } from './scaffold.js';
export { validateProjectName, validateTargetDirectory } from './validator.js';
export {
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
} from './package-manager.js';
export { generateTemplateFiles, type GenerateTemplateOptions } from './template.js';
export {
  generateAgentContextFiles,
  generateCursorRules,
  generateAgentsMarkdown,
  generateClaudeMarkdown,
  generateAgentGuide,
  type AgentContextOptions,
} from './agent-context.js';
export { promptSelect, AI_ENGINE_CHOICES, type Choice, type PromptSelectOptions } from './prompts.js';
export { initGit, isGitInstalled, isInsideGitWorkTree } from './git.js';

export type {
  PackageManager,
  TemplateName,
  AIEngineName,
  AIEngine,
  AIEngineChoice,
  ScaffoldOptions,
  ScaffoldResult,
  ValidationResult,
} from './types.js';
export { SUPPORTED_AI_ENGINES } from './types.js';

