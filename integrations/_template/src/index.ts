export interface IntegrationOptions {
  apiKey?: string;
  endpoint?: string;
}

export function createIntegration(options: IntegrationOptions = {}) {
  return {
    name: 'custom-integration',
    version: '0.4.0',
    init() {
      // Integration lifecycle hooks
    },
  };
}

export default createIntegration;
