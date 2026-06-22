import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HealthTracker } from '../infrastructure/health.js';

export function registerHealth(server: McpServer, health: HealthTracker) {
  server.resource('health', 'search://health', async () => ({
    contents: [{
      uri: 'search://health',
      mimeType: 'application/json',
      text: JSON.stringify(health.getHealth(), null, 2),
    }]
  }));
}
