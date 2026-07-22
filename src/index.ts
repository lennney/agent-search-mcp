#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupFreeSearchTool, healthTracker, serverMetrics } from './tools/free-search.js';
import { registerFreeSearchAdvanced } from './tools/free-search-advanced.js';
import { registerFreeExtract } from './tools/free-extract.js';
import { setupFetchTools } from './tools/fetch-tools.js';
import { registerCapabilities } from './tools/capabilities.js';
import { registerHealth, registerHealthMetrics } from './tools/health.js';
import { registerSearchWithSynthesis } from './tools/search-with-synthesis.js';
import { registerFreeSearchNews } from './tools/free-search-news.js';
import { loadConfig } from './infrastructure/config.js';
import { createHttpServer } from './infrastructure/http.js';

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: 'agent-search-mcp',
    version: '3.0.1',
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
  registerHealthMetrics(server, serverMetrics);

  // Start based on mode
  if (config.mode === 'stdio' || config.mode === 'both') {
    console.error('🔍 agent-search-mcp starting in STDIO mode...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ agent-search-mcp ready (STDIO)');
    console.error('⭐ Like agent-search-mcp? Star & watch for updates: https://github.com/lennney/agent-search-mcp');
  }

  if (config.mode === 'http' || config.mode === 'both') {
    const httpServer = createHttpServer({
      port: config.port,
      enableCors: config.enableCors,
      corsOrigin: config.corsOrigin,
    });
    await httpServer.listen();
    console.error('✅ agent-search-mcp ready (HTTP)');
    console.error('⭐ Like agent-search-mcp? Star & watch for updates: https://github.com/lennney/agent-search-mcp');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
