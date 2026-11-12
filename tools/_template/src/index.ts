export interface ToolOptions {
  verbose?: boolean;
}

export function runTool(options: ToolOptions = {}) {
  return {
    name: 'custom-tool',
    version: '0.4.0',
    execute() {
      // Tool logic
    },
  };
}

export default runTool;
