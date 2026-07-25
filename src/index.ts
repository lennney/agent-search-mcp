#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './infrastructure/config.js';
import { createHttpServer } from './infrastructure/http.js';
import { createAgentSearchServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.mode === 'stdio' || config.mode === 'both') {
    const server = createAgentSearchServer(config);
    console.error('🔍 agent-search-mcp starting in STDIO mode...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ agent-search-mcp ready (STDIO)');
    console.error(
      '⭐ Like agent-search-mcp? Star & watch for updates: '
      + 'https://github.com/lennney/agent-search-mcp',
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
      () => createAgentSearchServer(config),
      {
        port: config.port,
        enableCors: config.enableCors,
        corsOrigin: config.corsOrigin,
        allowedOrigins: config.allowedOrigins,
        authToken: config.httpAuthToken,
      },
    );
    await httpServer.listen();
    console.error('✅ agent-search-mcp ready (HTTP)');
    console.error(
      '⭐ Like agent-search-mcp? Star & watch for updates: '
      + 'https://github.com/lennney/agent-search-mcp',
    );
  }
}

const serverPromise = main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { serverPromise };
