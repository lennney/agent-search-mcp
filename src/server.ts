import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  getDefaultSearchRuntime,
  type SearchRuntime,
} from './infrastructure/search-runtime.js';
import { ToolPolicy } from './infrastructure/tool-policy.js';
import { readCurrentVersion } from './infrastructure/version-check.js';
import { registerCapabilities } from './tools/capabilities.js';
import { registerHealth, registerHealthMetrics } from './tools/health.js';
import { registerConfiguredTools } from './tools/registry.js';

/**
 * Build one fully registered stable MCP server.
 *
 * stdio uses one instance for its long-lived connection. Stateless HTTP must
 * call this factory once per request because SDK v1 transports are single-use
 * when sessionIdGenerator is undefined.
 */
export function createAgentSearchServer(
  runtime: SearchRuntime = getDefaultSearchRuntime(),
): McpServer {
  const { config } = runtime;
  const server = new McpServer(
    {
      name: 'agent-search-mcp',
      version: readCurrentVersion(),
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: false },
      },
    },
  );

  const toolPolicy = new ToolPolicy(config.enabledTools, config.disabledTools);

  registerConfiguredTools(server, toolPolicy, runtime);

  registerCapabilities(server, toolPolicy);
  registerHealth(server, runtime.healthTracker);
  registerHealthMetrics(server, runtime.serverMetrics);

  return server;
}
