import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const openClients: Client[] = [];
const openProcesses: ChildProcess[] = [];

afterEach(async () => {
  await Promise.all(openClients.splice(0).map(client => client.close()));
  await Promise.all(openProcesses.splice(0).map(stopProcess));
});

describe('MCP 2026 client compatibility with the stable server', () => {
  it('probes in auto mode and falls back to the legacy stdio handshake', async () => {
    const stableEntry = resolve(process.cwd(), '../../dist/index.js');
    const client = new Client(
      { name: 'fallback-test-client', version: '1.0.0' },
      {
        versionNegotiation: {
          mode: 'auto',
          probe: {
            timeoutMs: 2_000,
            maxRetries: 0,
          },
        },
      },
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [stableEntry],
      cwd: resolve(process.cwd(), '../..'),
      stderr: 'pipe',
    });

    await client.connect(transport);
    openClients.push(client);

    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    expect(client.getDiscoverResult()).toBeUndefined();
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('free_search');
  }, 10_000);

  it('falls back in auto mode over a real stable HTTP process', async () => {
    const repositoryRoot = resolve(process.cwd(), '../..');
    const stableEntry = resolve(repositoryRoot, 'dist/index.js');
    const port = await findFreePort();
    const child = spawn(process.execPath, [stableEntry], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MODE: 'http',
        PORT: String(port),
        HTTP_ALLOW_UNAUTHENTICATED: 'true',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    openProcesses.push(child);
    let childStderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => {
      childStderr += String(chunk);
    });
    await waitForHealth(port, child);

    const client = new Client(
      { name: 'http-fallback-test-client', version: '1.0.0' },
      {
        versionNegotiation: {
          mode: 'auto',
          probe: {
            timeoutMs: 2_000,
            maxRetries: 0,
          },
        },
      },
    );
    const exchanges: Array<{
      method: string;
      requestBody: string;
      requestProtocol: string | null;
      status: number;
      responseBody: string;
    }> = [];
    const tracedFetch: FetchLike = async (input, init) => {
      const request = input instanceof Request
        ? new Request(input, init)
        : new Request(input, init);
      const requestBody = await request.clone().text();
      const response = await fetch(request);
      exchanges.push({
        method: request.method,
        requestBody,
        requestProtocol: request.headers.get('mcp-protocol-version'),
        status: response.status,
        responseBody: await response.clone().text(),
      });
      return response;
    };
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      { fetch: tracedFetch },
    );

    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(
        `HTTP fallback failed: ${error instanceof Error ? error.message : String(error)}`
        + `\n${JSON.stringify(exchanges, null, 2)}`
        + `\nStable stderr:\n${childStderr}`,
      );
    }
    openClients.push(client);

    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
    expect(client.getDiscoverResult()).toBeUndefined();
    expect((await client.listTools()).tools.map(tool => tool.name)).toContain('free_search');
  }, 10_000);
});

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve a local test port');
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close(error => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
  return address.port;
}

async function waitForHealth(port: number, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Stable HTTP process exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error('Stable HTTP process did not become ready');
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>(resolveExit => {
    child.once('exit', () => resolveExit());
  });
  child.kill();
  await exited;
}
