#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupFreeSearchTool, healthTracker } from './tools/free-search.js';
import { registerFreeSearchAdvanced } from './tools/free-search-advanced.js';
import { registerFreeExtract } from './tools/free-extract.js';
import { setupFetchTools } from './tools/fetch-tools.js';
import { registerCapabilities } from './tools/capabilities.js';
import { registerHealth } from './tools/health.js';
import { registerSearchWithSynthesis } from './tools/search-with-synthesis.js';
import { registerFreeSearchNews } from './tools/free-search-news.js';
import { loadConfig } from './infrastructure/config.js';
import { createHttpServer } from './infrastructure/http.js';

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: 'agent-search-mcp',
    version: '2.1.0',
  });

  // Register tools
  setupFreeSearchTool(server);
  registerFreeSearchAdvanced(server);
  registerFreeExtract(server);
  setupFetchTools(server);
  registerSearchWithSynthesis(server);
  registerFreeSearchNews(server);

  // Register resources
  registerCapabilities(server);
  registerHealth(server, healthTracker);

  // Start based on mode
  if (config.mode === 'stdio' || config.mode === 'both') {
    console.error('🔍 agent-search-mcp starting in STDIO mode...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ agent-search-mcp ready (STDIO)');
  }

  if (config.mode === 'http' || config.mode === 'both') {
    const httpServer = createHttpServer({
      port: config.port,
      enableCors: config.enableCors,
      corsOrigin: config.corsOrigin,
    });
    await httpServer.listen();
    console.error('✅ agent-search-mcp ready (HTTP)');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
