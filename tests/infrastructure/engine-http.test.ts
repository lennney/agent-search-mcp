import {
  createServer,
  type IncomingMessage,
  type Server,
} from 'node:http';
import type { Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeEngineHttpTransport,
  fetchForEngine,
} from '../../src/infrastructure/engine-http.js';

describe('engine HTTP transport', () => {
  const originalFetch = global.fetch;
  const servers: Server[] = [];

  afterEach(async () => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map(closeServer));
    await closeEngineHttpTransport();
  });

  it('keeps direct requests on global fetch when project proxy config is absent', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://system-proxy.invalid:8080');
    global.fetch = vi.fn(async () => new Response('direct')) as typeof fetch;

    const response = await fetchForEngine(
      'sogou',
      'https://www.sogou.com/web?query=test',
    );

    expect(await response.text()).toBe('direct');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('routes an engine request through its explicit proxy with redacted auth', async () => {
    let observedConnectTarget = '';
    let observedRequestPath = '';
    let observedProxyAuthorization = '';
    const proxy = await listen(createTunnelProxy((request, socket, rawRequest) => {
      observedConnectTarget = request.url ?? '';
      observedRequestPath = rawRequest.split(' ')[1] ?? '';
      observedProxyAuthorization = request.headers['proxy-authorization'] ?? '';
      respondThroughTunnel(socket, 200, 'proxied');
    }));
    servers.push(proxy.server);
    vi.stubEnv(
      'SOGOU_PROXY_URL',
      `http://proxy-user:proxy-secret@127.0.0.1:${proxy.port}`,
    );

    const response = await fetchForEngine(
      'sogou',
      'http://target.example/search?q=test',
    );

    expect(await response.text()).toBe('proxied');
    expect(observedConnectTarget).toBe('target.example:80');
    expect(observedRequestPath).toBe('/search?q=test');
    expect(observedProxyAuthorization).toBe(
      `Basic ${Buffer.from('proxy-user:proxy-secret').toString('base64')}`,
    );
  });

  it('uses the existing USE_PROXY and PROXY_URL contract', async () => {
    const proxy = await listen(createTunnelProxy((_request, socket) => {
      respondThroughTunnel(socket, 204);
    }));
    servers.push(proxy.server);
    vi.stubEnv('USE_PROXY', 'true');
    vi.stubEnv('PROXY_URL', `http://127.0.0.1:${proxy.port}`);

    const response = await fetchForEngine(
      'duckduckgo',
      'http://target.example/search',
    );

    expect(response.status).toBe(204);
  });

  it('preserves caller cancellation for proxied requests', async () => {
    let requestReceived!: () => void;
    const received = new Promise<void>(resolve => {
      requestReceived = resolve;
    });
    const proxy = await listen(createTunnelProxy(request => {
      requestReceived();
      request.on('error', () => undefined);
    }));
    servers.push(proxy.server);
    vi.stubEnv('SOGOU_PROXY_URL', `http://127.0.0.1:${proxy.port}`);
    const controller = new AbortController();

    const request = fetchForEngine(
      'sogou',
      'http://target.example/slow',
      { signal: controller.signal },
    );
    await received;
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects unsupported proxy protocols without exposing credentials', async () => {
    vi.stubEnv(
      'SOGOU_PROXY_URL',
      'socks5://proxy-user:proxy-secret@127.0.0.1:1080',
    );

    let failure: unknown;
    try {
      await fetchForEngine('sogou', 'https://www.sogou.com/web');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      failureType: 'validation_error',
      retryable: false,
    });
    expect((failure as Error).cause).toBeUndefined();
    expect(String(failure)).not.toContain('proxy-user');
    expect(String(failure)).not.toContain('proxy-secret');
  });
});

async function listen(server: Server): Promise<{ server: Server; port: number }> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Test server did not expose a TCP address');
  }
  return { server, port: address.port };
}

function createTunnelProxy(
  onRequest: (
    connectRequest: IncomingMessage,
    socket: Socket,
    rawRequest: string,
  ) => void,
): Server {
  const server = createServer((_request, response) => {
    response.writeHead(500);
    response.end('Expected CONNECT');
  });
  const sockets = new Set<Socket>();
  tunnelSockets.set(server, sockets);
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, socket, head) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    let requestBytes = head;
    const receiveRequest = (chunk: Buffer) => {
      requestBytes = Buffer.concat([requestBytes, chunk]);
      if (!requestBytes.includes('\r\n\r\n')) return;
      socket.off('data', receiveRequest);
      onRequest(request, socket, requestBytes.toString('latin1'));
    };
    socket.on('data', receiveRequest);
  });
  return server;
}

const tunnelSockets = new WeakMap<Server, Set<Socket>>();

function respondThroughTunnel(
  socket: Socket,
  status: number,
  body = '',
): void {
  const reason = status === 204 ? 'No Content' : 'OK';
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n`
      + `Content-Length: ${Buffer.byteLength(body)}\r\n`
      + 'Connection: close\r\n'
      + '\r\n'
      + body,
  );
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  for (const socket of tunnelSockets.get(server) ?? []) socket.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
