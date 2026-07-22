#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupFreeSearchTool, healthTracker, serverMetrics } from './tools/free-search.js';
import { registerFreeSearchAdvanced } from './tools/free-search-advanced.js';
import { registerFreeExtract } from './tools/free-extract.js';
import {
  setupFetchCsdnArticle,
  setupFetchGithubReadme,
  setupFetchJuejinArticle,
} from './tools/fetch-tools.js';
import { registerCapabilities } from './tools/capabilities.js';
import { registerHealth, registerHealthMetrics } from './tools/health.js';
import { registerSearchWithSynthesis } from './tools/search-with-synthesis.js';
import { registerFreeSearchNews } from './tools/free-search-news.js';
import { loadConfig } from './infrastructure/config.js';
import { ToolPolicy } from './infrastructure/tool-policy.js';
import { createHttpServer } from './infrastructure/http.js';

async function main() {
  const config = loadConfig();

  const server = new McpServer(
    {
      name: 'agent-search-mcp',
      version: '3.1.1',
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: false },
      },
    }
  );

  // Register tools (conditionally based on ENABLED_TOOLS / DISABLED_TOOLS)
  const toolPolicy = new ToolPolicy(config.enabledTools, config.disabledTools);

  if (toolPolicy.isToolEnabled('free_search')) setupFreeSearchTool(server);
  if (toolPolicy.isToolEnabled('free_search_advanced')) registerFreeSearchAdvanced(server);
  if (toolPolicy.isToolEnabled('free_extract')) registerFreeExtract(server);
  if (toolPolicy.isToolEnabled('fetch_github_readme')) setupFetchGithubReadme(server);
  if (toolPolicy.isToolEnabled('fetch_csdn_article')) setupFetchCsdnArticle(server);
  if (toolPolicy.isToolEnabled('fetch_juejin_article')) setupFetchJuejinArticle(server);
  if (toolPolicy.isToolEnabled('search_with_synthesis')) registerSearchWithSynthesis(server);
  if (toolPolicy.isToolEnabled('free_search_news')) registerFreeSearchNews(server);

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
    const httpServer = createHttpServer(server, {
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
