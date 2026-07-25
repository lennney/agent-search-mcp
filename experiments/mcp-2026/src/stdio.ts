import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createExperimentalServer } from './server.js';

/**
 * Serve both MCP eras over stdio. The opening exchange pins one era for the
 * connection, so SDK v1 and v2 objects never cross the process boundary.
 */
export function startExperimentalStdio(): { close: () => Promise<void> } {
  return serveStdio(
    context => createExperimentalServer(context),
    {
      legacy: 'serve',
      onerror: error => {
        console.error('Experimental MCP stdio error:', error.message);
      },
    },
  );
}

async function main(): Promise<void> {
  const handle = startExperimentalStdio();
  console.error('Experimental MCP 2026 stdio server ready (2025 fallback enabled)');

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (directEntry) {
  void main().catch(error => {
    console.error('Experimental MCP stdio fatal error:', error);
    process.exit(1);
  });
}
