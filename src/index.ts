#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupFreeSearchTool, healthTracker } from './tools/free-search.js';
import { registerFreeSearchAdvanced } from './tools/free-search-advanced.js';
import { registerFreeExtract } from './tools/free-extract.js';
import { registerCapabilities } from './tools/capabilities.js';
import { registerHealth } from './tools/health.js';

async function main() {
  const server = new McpServer({
    name: 'agent-search-mcp',
    version: '1.0.0',
  });

  // Register tools
  setupFreeSearchTool(server);
  registerFreeSearchAdvanced(server);
  registerFreeExtract(server);

  // Register resources
  registerCapabilities(server);
  registerHealth(server, healthTracker);

  console.error('🔍 agent-search-mcp starting in STDIO mode...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('✅ agent-search-mcp ready');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
