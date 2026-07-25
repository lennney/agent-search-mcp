import { afterEach, describe, expect, it } from 'vitest';
import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
  type Tool,
} from '@modelcontextprotocol/client';

import {
  createExperimentalHandler,
  type ExperimentalHandler,
} from '../src/server.js';

const openHandlers: ExperimentalHandler[] = [];
const openClients: Client[] = [];

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 2_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function trackedFetch(
  handler: ExperimentalHandler,
  onMethod: (method: string) => void,
): FetchLike {
  return async (input, init) => {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(input, init);
    if (request.method === 'POST') {
      const body = await request.clone().json() as { method?: string };
      if (typeof body.method === 'string') onMethod(body.method);
    }
    return handler.fetch(request);
  };
}

afterEach(async () => {
  await Promise.all(openClients.splice(0).map(client => client.close()));
  await Promise.all(openHandlers.splice(0).map(handler => handler.close()));
});

describe('experimental MCP 2026 cache and tool-list changes', () => {
  it('emits public tools/list cache hints and serves a fresh second call locally', async () => {
    const handler = createExperimentalHandler();
    openHandlers.push(handler);
    let listRequests = 0;
    const client = new Client(
      { name: 'cache-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(new StreamableHTTPClientTransport(
      new URL('http://test.local/mcp'),
      {
        fetch: trackedFetch(handler, method => {
          if (method === 'tools/list') listRequests += 1;
        }),
      },
    ));
    openClients.push(client);

    const first = await client.listTools();
    const second = await client.listTools();

    expect(first.ttlMs).toBe(300_000);
    expect(first.cacheScope).toBe('public');
    expect(second.tools.map(tool => tool.name)).toEqual(['free_search']);
    expect(listRequests).toBe(1);
  });

  it('invalidates the tools cache and refreshes after a modern list_changed event', async () => {
    const handler = createExperimentalHandler();
    openHandlers.push(handler);
    let listRequests = 0;
    let resolveChanged: ((result: { error?: Error; tools?: Tool[] }) => void) | undefined;
    const changed = new Promise<{ error?: Error; tools?: Tool[] }>(resolve => {
      resolveChanged = resolve;
    });
    const client = new Client(
      { name: 'list-changed-test', version: '1.0.0' },
      {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
        listChanged: {
          tools: {
            debounceMs: 0,
            onChanged: (error, tools) => {
              resolveChanged?.({
                ...(error != null && { error }),
                ...(tools != null && { tools }),
              });
            },
          },
        },
      },
    );
    await client.connect(new StreamableHTTPClientTransport(
      new URL('http://test.local/mcp'),
      {
        fetch: trackedFetch(handler, method => {
          if (method === 'tools/list') listRequests += 1;
        }),
      },
    ));
    openClients.push(client);

    await client.listTools();
    expect(client.autoOpenedSubscription).toBeDefined();
    handler.notify.toolsChanged();

    const refreshed = await withTimeout(changed, 'tools/list_changed timeout');

    expect(refreshed.error).toBeUndefined();
    expect(refreshed.tools?.map(tool => tool.name)).toEqual(['free_search']);
    expect(listRequests).toBe(2);
  });
});
