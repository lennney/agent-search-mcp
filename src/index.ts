#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './infrastructure/config.js';
import { createHttpServer } from './infrastructure/http.js';
import { logger } from './infrastructure/logger.js';
import { createSearchRuntime } from './infrastructure/search-runtime.js';
import { createAgentSearchServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const searchRuntime = createSearchRuntime({ config });

  if (config.mode === 'stdio' || config.mode === 'both') {
    const server = createAgentSearchServer(searchRuntime);
    logger.info('agent-search-mcp starting in STDIO mode');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('agent-search-mcp ready in STDIO mode');
    logger.info(
      { repository: 'https://github.com/lennney/agent-search-mcp' },
      'Agent Search MCP project repository',
    );
  }

  if (config.mode === 'http' || config.mode === 'both') {
    if (!config.httpAuthToken && !config.httpAllowUnauthenticated) {
      throw new Error(
        'HTTP mode requires HTTP_AUTH_TOKEN. '
        + 'Set HTTP_ALLOW_UNAUTHENTICATED=true only on a trusted local network.',
      );
    }
    const httpServer = createHttpServer(
      () => createAgentSearchServer(searchRuntime),
      {
        port: config.port,
        enableCors: config.enableCors,
        corsOrigin: config.corsOrigin,
        allowedOrigins: config.allowedOrigins,
        authToken: config.httpAuthToken,
      },
    );
    await httpServer.listen();
    logger.info('agent-search-mcp ready in HTTP mode');
    logger.info(
      { repository: 'https://github.com/lennney/agent-search-mcp' },
      'Agent Search MCP project repository',
    );
  }
}

const serverPromise = main().catch((error: unknown) => {
  logger.fatal(
    { err: error instanceof Error ? error.message : String(error) },
    'Fatal server error',
  );
  process.exit(1);
});

export { serverPromise };
