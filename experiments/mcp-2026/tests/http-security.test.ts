import { afterEach, describe, expect, it } from 'vitest';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

import {
  createExperimentalNodeServer,
  type ExperimentalNodeServer,
} from '../src/http.js';
import { createExperimentalHandler } from '../src/server.js';

const openServers: ExperimentalNodeServer[] = [];
const openClients: Client[] = [];

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

async function startGuardedServer(): Promise<ExperimentalNodeServer> {
  const handler = createExperimentalHandler({
    search: async options => emptySearchResponse(options.query),
  });
  const server = createExperimentalNodeServer(handler, {
    host: '127.0.0.1',
    port: 0,
    authToken: 'test-token',
    allowUnauthenticated: false,
    allowedHosts: ['127.0.0.1'],
    allowedOrigins: ['https://trusted.example'],
  });
  await server.listen();
  openServers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(openClients.splice(0).map(client => client.close()));
  await Promise.all(openServers.splice(0).map(server => server.close()));
});

describe('experimental MCP 2026 HTTP security matrix', () => {
  it('answers trusted CORS preflight with the complete routing and trace allowlist', async () => {
    const server = await startGuardedServer();
    const response = await fetch(`http://127.0.0.1:${server.getPort()}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://trusted.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'authorization, content-type, mcp-protocol-version, mcp-method, mcp-name, traceparent, tracestate, baggage',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://trusted.example');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    const allowedHeaders = response.headers.get('access-control-allow-headers')?.toLowerCase();
    expect(allowedHeaders).toContain('authorization');
    expect(allowedHeaders).toContain('mcp-protocol-version');
    expect(allowedHeaders).toContain('mcp-method');
    expect(allowedHeaders).toContain('mcp-name');
    expect(allowedHeaders).toContain('traceparent');
    expect(allowedHeaders).toContain('tracestate');
    expect(allowedHeaders).toContain('baggage');
  });

  it('rejects untrusted preflight and POST origins without reflecting them', async () => {
    const server = await startGuardedServer();
    const url = `http://127.0.0.1:${server.getPort()}/mcp`;

    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const post = await fetch(url, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: {},
      }),
    });

    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(post.status).toBe(403);
    expect(post.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects absent and incorrect Bearer credentials and accepts case-insensitive scheme', async () => {
    const server = await startGuardedServer();
    const url = `http://127.0.0.1:${server.getPort()}/mcp`;
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {},
    });

    const absent = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    const incorrect = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token',
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    expect(absent.status).toBe(401);
    expect(absent.headers.get('www-authenticate')).toBe('Bearer');
    expect(incorrect.status).toBe(401);
    expect(incorrect.headers.get('www-authenticate')).toBe('Bearer');

    const client = new Client(
      { name: 'bearer-case-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: {
          Authorization: 'bearer test-token',
          Origin: 'https://trusted.example',
        },
      },
    }));
    openClients.push(client);

    expect(client.getProtocolEra()).toBe('modern');
  });
});
