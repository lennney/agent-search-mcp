import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HealthTracker, ServerMetrics } from '../infrastructure/health.js';

export function registerHealth(server: McpServer, health: HealthTracker) {
  server.resource('health', 'search://health', async () => ({
    contents: [{
      uri: 'search://health',
      mimeType: 'application/json',
      text: JSON.stringify(health.getHealth(), null, 2),
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
