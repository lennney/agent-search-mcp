import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HealthTracker, ServerMetrics, ProviderHealth } from '../infrastructure/health.js';
import { isDdgsAvailable } from '../engines/duckduckgo.js';

/**
 * Augment the DDG provider's health entry with ddgs availability info.
 */
function augmentDdgHealth(health: ProviderHealth[]): ProviderHealth[] {
  return health.map((h) => {
    if (h.provider === 'duckduckgo') {
      return {
        ...h,
        ddgs_available: isDdgsAvailable(),
      };
    }
    return h;
  });
}

export function registerHealth(server: McpServer, health: HealthTracker) {
  server.resource('health', 'search://health', async () => ({
    contents: [{
      uri: 'search://health',
      mimeType: 'application/json',
      text: JSON.stringify(augmentDdgHealth(health.getHealth()), null, 2),
    }]
  }));
}

export function registerHealthMetrics(server: McpServer, metrics: ServerMetrics) {
  server.resource('health-metrics', 'mcp://health/metrics', async () => ({
    contents: [{
      uri: 'mcp://health/metrics',
      mimeType: 'application/json',
      text: JSON.stringify(metrics.getMetrics(), null, 2),
    }]
  }));
}
