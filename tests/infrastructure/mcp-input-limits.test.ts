import * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod/v4';

import { loadConfig } from '../../src/infrastructure/config.js';
import { createHttpServer } from '../../src/infrastructure/http.js';
import { createSearchRuntime } from '../../src/infrastructure/search-runtime.js';
import { createAgentSearchServer } from '../../src/server.js';

// Public safety limits: keep these assertions independent of implementation constants.
const MAX_BODY_BYTES = 256 * 1024;
const MAX_INPUT_ELEMENTS = 1_000;
const authorization = 'Bearer input-limit-test-token';
const headers = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  'MCP-Protocol-Version': '2025-11-25',
  Authorization: authorization,
};
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

function createOfflineServer() {
  const dispatch = vi.fn(async () => []);
  const runtime = createSearchRuntime({
    config: { ...loadConfig(), searchCacheDirectory: '', providerCooldownStorePath: '' },
    searchProvider: dispatch,
  });
  const server = createAgentSearchServer(runtime);
  return { server, dispatch };
}

async function startHttp() {
  const handler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));
  const factory = vi.fn(() => {
    const { server } = createOfflineServer();
    server.registerTool('body_probe', { inputSchema: { value: z.string() } }, handler);
    return server;
  });
  const server = createHttpServer(factory, {
    port: 0, enableCors: false, corsOrigin: '', authToken: 'input-limit-test-token',
  });
  await server.listen();
  cleanups.push(server.close);
  return { url: `http://127.0.0.1:${server.getPort()}`, handler, factory };
}

function toolBody(value: string): string {
  return JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'body_probe', arguments: { value } },
  });
}

function keepAliveAgent(): http.Agent {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  cleanups.push(async () => { agent.destroy(); });
  return agent;
}

async function rawPost(url: string, body: string, chunked = false, agent?: http.Agent) {
  return new Promise<{ status: number; body: string; connection?: string }>((resolve, reject) => {
    const request = http.request(`${url}/mcp`, {
      method: 'POST',
      agent,
      headers: {
        ...headers,
        ...(chunked ? { 'Transfer-Encoding': 'chunked' } : { 'Content-Length': Buffer.byteLength(body) }),
      },
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString(),
        connection: response.headers.connection,
      }));
    });
    request.on('error', reject);
    request.setTimeout(3_000, () => request.destroy(new Error(`Local request timed out (${Buffer.byteLength(body)} bytes)`)));
    if (chunked) {
      const bytes = Buffer.from(body);
      request.write(bytes.subarray(0, Math.floor(bytes.length / 2)));
      request.end(bytes.subarray(Math.floor(bytes.length / 2)));
    } else {
      request.end(body);
    }
  });
}

describe('stable MCP HTTP request limits', () => {
  it('rejects a declared oversized body before running the tool and keeps serving requests', async () => {
    const { url, handler } = await startHttp();
    const agent = keepAliveAgent();
    const body = toolBody('x'.repeat(MAX_BODY_BYTES + 1 - Buffer.byteLength(toolBody(''))));
    expect(Buffer.byteLength(body)).toBe(MAX_BODY_BYTES + 1);
    const response = await rawPost(url, body, false, agent);
    expect(response.status).toBe(413);
    expect(response.connection).toBe('close');
    expect(handler).not.toHaveBeenCalled();
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await rawPost(url, toolBody('ok'), false, agent)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('limits streamed bytes without Content-Length, including multibyte text', async () => {
    const { url, handler } = await startHttp();
    const agent = keepAliveAgent();
    const body = toolBody('界'.repeat(Math.ceil(MAX_BODY_BYTES / 3)));
    expect(body.length).toBeLessThan(MAX_BODY_BYTES);
    expect(Buffer.byteLength(body)).toBeGreaterThan(MAX_BODY_BYTES);
    const response = await rawPost(url, body, true, agent);
    expect(response.status).toBe(413);
    expect(response.connection).toBe('close');
    expect(handler).not.toHaveBeenCalled();
    expect((await rawPost(url, toolBody('after rejection'), true, agent)).status).toBe(200);
  });

  it('accepts a valid body exactly at the byte limit', async () => {
    const { url, handler } = await startHttp();
    const body = toolBody('x'.repeat(MAX_BODY_BYTES - Buffer.byteLength(toolBody(''))));
    expect(Buffer.byteLength(body)).toBe(MAX_BODY_BYTES);
    expect((await rawPost(url, body)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('authenticates before creating a server or parsing a malformed oversized request', async () => {
    const { url, factory, handler } = await startHttp();
    const response = await fetch(`${url}/mcp`, {
      method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' },
      body: '!'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects batches over 100 messages even when the body is small', async () => {
    const { url, handler } = await startHttp();
    const body = JSON.stringify(Array.from({ length: 101 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'ping' })));
    expect(Buffer.byteLength(body)).toBeLessThan(MAX_BODY_BYTES);
    const response = await rawPost(url, body);
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error.message).toMatch(/100/);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts 100-message batches and rejects malformed JSON with 400', async () => {
    const { url } = await startHttp();
    const body = JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'ping' })));
    expect((await rawPost(url, body)).status).toBe(200);
    expect((await rawPost(url, '{')).status).toBe(400);
  });

  it('rejects large real tool arguments before provider dispatch over HTTP', async () => {
    const dispatch = vi.fn(async () => []);
    const runtime = createSearchRuntime({
      config: { ...loadConfig(), searchCacheDirectory: '', providerCooldownStorePath: '' },
      searchProvider: dispatch,
    });
    const server = createHttpServer(() => createAgentSearchServer(runtime), {
      port: 0, enableCors: false, corsOrigin: '', authToken: 'input-limit-test-token',
    });
    await server.listen();
    cleanups.push(server.close);
    const client = new Client({ name: 'limit-regression', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.getPort()}/mcp`), {
      requestInit: { headers: { Authorization: authorization } },
    });
    await client.connect(transport);
    cleanups.push(() => client.close());
    const result = await client.callTool({
      name: 'free_search', arguments: { query: 'offline input guard', engines: Array(MAX_INPUT_ELEMENTS).fill('not-a-provider') },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/maximum of 1000 elements/);
    expect(dispatch).not.toHaveBeenCalled();
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  });
});

describe('McpServer tool input element limits', () => {
  async function startClient() {
    const { server } = createOfflineServer();
    const handler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));
    server.registerTool('input_probe', {
      inputSchema: {
        values: z.array(z.unknown()).optional(),
        entries: z.record(z.string(), z.unknown()).optional(),
      },
    }, handler);
    const client = new Client({ name: 'limit-in-memory', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    cleanups.push(() => server.close());
    await client.connect(clientTransport);
    cleanups.push(() => client.close());
    return { client, handler };
  }

  it('accepts exactly 1000 elements, counting the argument key', async () => {
    const { client, handler } = await startClient();
    const result = await client.callTool({ name: 'input_probe', arguments: { values: Array(999).fill(null) } });
    expect(result.isError).not.toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['array', { values: Array(1000).fill(null) }],
    ['record', { entries: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(i), null])) }],
    ['nested array', { values: [Array(999).fill(null)] }],
  ])('rejects an oversized %s before its handler and recovers for the next call', async (_kind, args) => {
    const { client, handler } = await startClient();
    const result = await client.callTool({ name: 'input_probe', arguments: args });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/maximum of 1000 elements/);
    expect(handler).not.toHaveBeenCalled();
    expect((await client.callTool({ name: 'input_probe', arguments: { values: ['ok'] } })).isError).not.toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
