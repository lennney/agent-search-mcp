import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Config } from './infrastructure/config.js';
import { ToolPolicy } from './infrastructure/tool-policy.js';
import { registerCapabilities } from './tools/capabilities.js';
import {
  setupFetchCsdnArticle,
  setupFetchGithubReadme,
  setupFetchJuejinArticle,
} from './tools/fetch-tools.js';
import { registerFreeExtract } from './tools/free-extract.js';
import { registerFreeSearchAdvanced } from './tools/free-search-advanced.js';
import { registerFreeSearchNews } from './tools/free-search-news.js';
import {
  healthTracker,
  serverMetrics,
  setupFreeSearchTool,
} from './tools/free-search.js';
import { registerHealth, registerHealthMetrics } from './tools/health.js';
import { registerSearchWithSynthesis } from './tools/search-with-synthesis.js';

/**
 * Build one fully registered stable MCP server.
 *
 * stdio uses one instance for its long-lived connection. Stateless HTTP must
 * call this factory once per request because SDK v1 transports are single-use
 * when sessionIdGenerator is undefined.
 */
export function createAgentSearchServer(config: Config): McpServer {
  const server = new McpServer(
    {
      name: 'agent-search-mcp',
      version: '3.1.3',
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: false },
      },
    },
  );

  const toolPolicy = new ToolPolicy(config.enabledTools, config.disabledTools);

  if (toolPolicy.isToolEnabled('free_search')) setupFreeSearchTool(server);
  if (toolPolicy.isToolEnabled('free_search_advanced')) registerFreeSearchAdvanced(server);
  if (toolPolicy.isToolEnabled('free_extract')) registerFreeExtract(server);
  if (toolPolicy.isToolEnabled('fetch_github_readme')) setupFetchGithubReadme(server);
  if (toolPolicy.isToolEnabled('fetch_csdn_article')) setupFetchCsdnArticle(server);
  if (toolPolicy.isToolEnabled('fetch_juejin_article')) setupFetchJuejinArticle(server);
  if (toolPolicy.isToolEnabled('search_with_synthesis')) registerSearchWithSynthesis(server);
  if (toolPolicy.isToolEnabled('free_search_news')) registerFreeSearchNews(server);

  registerCapabilities(server);
  registerHealth(server, healthTracker);
  registerHealthMetrics(server, serverMetrics);

  return server;
}
