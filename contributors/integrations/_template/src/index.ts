export interface IntegrationOptions {
  apiKey?: string;
  endpoint?: string;
}

export function createIntegration(_options: IntegrationOptions = {}) {
  return {
    name: 'custom-integration',
    version: '0.1.0',
    init() {
      // Integration lifecycle hooks
    },
  };
}

export default createIntegration;
