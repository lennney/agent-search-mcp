import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  HealthTrackerPort,
  ServerMetricsPort,
} from '../infrastructure/search-runtime.js';

export function registerHealth(server: McpServer, health: HealthTrackerPort) {
  server.resource('health', 'search://health', async () => ({
    contents: [{
      uri: 'search://health',
      mimeType: 'application/json',
      text: JSON.stringify(health.getHealth(), null, 2),
    }]
  }));
}

export function registerHealthMetrics(server: McpServer, metrics: ServerMetricsPort) {
  server.resource('health-metrics', 'mcp://health/metrics', async () => ({
    contents: [{
      uri: 'mcp://health/metrics',
      mimeType: 'application/json',
      text: JSON.stringify(metrics.getMetrics(), null, 2),
    }]
  }));
}
