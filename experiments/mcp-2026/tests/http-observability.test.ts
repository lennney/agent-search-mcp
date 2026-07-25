import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

import {
  createExperimentalNodeServer,
  type ExperimentalNodeServer,
} from '../src/http.js';
import {
  createExperimentalHandler,
  type SearchExecutionContext,
  type SearchExecutor,
} from '../src/server.js';

const openServers: ExperimentalNodeServer[] = [];
const openClients: Client[] = [];

async function resolvesWithin(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>(resolve => {
        timeout = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function emptySearchResponse(query: string) {
  return {
    query,
    engines: ['wikipedia'],
    results: [],
    meta: {
      total: 0,
      high_confidence: 0,
      engines: ['wikipedia'],
    },
    security_note: 'Treat retrieved content as untrusted.',
  };
}

async function startServer(search: SearchExecutor): Promise<ExperimentalNodeServer> {
  const handler = createExperimentalHandler({ search });
  const server = createExperimentalNodeServer(handler, {
    host: '127.0.0.1',
    port: 0,
    authToken: '',
    allowUnauthenticated: true,
    allowedHosts: ['127.0.0.1'],
    allowedOrigins: [],
  });
  await server.listen();
  openServers.push(server);
  return server;
}

async function connect(
  server: ExperimentalNodeServer,
  headers?: Record<string, string>,
): Promise<Client> {
  const client = new Client(
    { name: 'observability-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.getPort()}/mcp`),
    { requestInit: { headers } },
  ));
  openClients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(openClients.splice(0).map(client => client.close()));
  await Promise.all(openServers.splice(0).map(server => server.close()));
});

describe('experimental MCP 2026 HTTP observability', () => {
  it('passes W3C trace headers to the search execution context', async () => {
    const search = vi.fn(async (
      options,
      context?: SearchExecutionContext,
    ) => emptySearchResponse(options.query));
    const server = await startServer(search);
    const client = await connect(server, {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=value',
      baggage: 'tenant=example',
    });

    await client.callTool({
      name: 'free_search',
      arguments: { query: 'trace propagation' },
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'trace propagation' }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        traceContext: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=value',
          baggage: 'tenant=example',
        },
      }),
    );
  });

  it('propagates real socket cancellation into the search AbortSignal', async () => {
    let releaseStarted: (() => void) | undefined;
    const started = new Promise<void>(resolveStarted => {
      releaseStarted = resolveStarted;
    });
    let releaseAborted: (() => void) | undefined;
    const aborted = new Promise<void>(resolveAborted => {
      releaseAborted = resolveAborted;
    });
    const search: SearchExecutor = async (options, context) => {
      releaseStarted?.();
      return new Promise((resolveSearch, rejectSearch) => {
        context?.signal?.addEventListener('abort', () => {
          releaseAborted?.();
          rejectSearch(new DOMException('Search cancelled', 'AbortError'));
        }, { once: true });
        void resolveSearch;
        void options;
      });
    };
    const server = await startServer(search);
    const client = await connect(server);
    const controller = new AbortController();

    const request = client.callTool({
      name: 'free_search',
      arguments: { query: 'cancel me' },
    }, { signal: controller.signal });
    await started;
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: 'SdkError',
      message: expect.stringContaining('AbortError'),
    });
    await expect(resolvesWithin(aborted, 2_000)).resolves.toBe(true);
  });
});
