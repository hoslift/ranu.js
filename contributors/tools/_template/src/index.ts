export interface ToolOptions {
  verbose?: boolean;
}

export function runTool(_options: ToolOptions = {}) {
  return {
    name: 'custom-tool',
    version: '0.1.0',
    execute() {
      // Tool logic
    },
  };
}

export default runTool;
