import {
  createServer,
  type IncomingMessage,
  type Server,
} from 'node:http';
import { createHash } from 'node:crypto';
import type { Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeEngineHttpTransport,
  fetchForEngine,
  getProxyHealthSnapshot,
  transportBackoffMs,
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

  it('routes a mojeek request through its explicit proxy', async () => {
    let observedRequestPath = '';
    const proxy = await listen(createTunnelProxy((_request, socket, rawRequest) => {
      observedRequestPath = rawRequest.split(' ')[1] ?? '';
      respondThroughTunnel(socket, 200, 'proxied');
    }));
    servers.push(proxy.server);
    vi.stubEnv('MOJEEK_PROXY_URL', `http://127.0.0.1:${proxy.port}`);

    const response = await fetchForEngine(
      'mojeek',
      'http://target.example/search?q=test',
    );

    expect(await response.text()).toBe('proxied');
    expect(observedRequestPath).toBe('/search?q=test');
  });

  it('routes a wiby request through its explicit proxy', async () => {
    let observedRequestPath = '';
    const proxy = await listen(createTunnelProxy((_request, socket, rawRequest) => {
      observedRequestPath = rawRequest.split(' ')[1] ?? '';
      respondThroughTunnel(socket, 200, 'proxied');
    }));
    servers.push(proxy.server);
    vi.stubEnv('WIBY_PROXY_URL', `http://127.0.0.1:${proxy.port}`);

    const response = await fetchForEngine(
      'wiby',
      'http://target.example/json/?q=test',
    );

    expect(await response.text()).toBe('proxied');
    expect(observedRequestPath).toBe('/json/?q=test');
  });

  it('keeps a query sticky and cools only a transport-failed proxy', async () => {
    let failedProxyRequests = 0;
    let healthyProxyRequests = 0;
    const failedProxy = await listen(createTunnelProxy((_request, socket) => {
      failedProxyRequests += 1;
      socket.destroy();
    }));
    const healthyProxy = await listen(createTunnelProxy((_request, socket) => {
      healthyProxyRequests += 1;
      respondThroughTunnel(socket, 200, 'healthy');
    }));
    servers.push(failedProxy.server, healthyProxy.server);
    vi.stubEnv('SOGOU_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${failedProxy.port}`,
      `http://127.0.0.1:${healthyProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('sogou', 0, 2);

    const first = await fetchForEngine(
      'sogou',
      'http://target.example/search',
      undefined,
      { affinityKey },
    );
    const second = await fetchForEngine(
      'sogou',
      'http://target.example/search',
      undefined,
      { affinityKey },
    );

    expect(await first.text()).toBe('healthy');
    expect(await second.text()).toBe('healthy');
    expect(failedProxyRequests).toBe(1);
    expect(healthyProxyRequests).toBe(2);
  });

  it('does not switch exits after an upstream HTTP rate-limit response', async () => {
    let firstProxyRequests = 0;
    let secondProxyRequests = 0;
    const firstProxy = await listen(createTunnelProxy((_request, socket) => {
      firstProxyRequests += 1;
      respondThroughTunnel(socket, 429, 'challenge');
    }));
    const secondProxy = await listen(createTunnelProxy((_request, socket) => {
      secondProxyRequests += 1;
      respondThroughTunnel(socket, 200, 'unexpected');
    }));
    servers.push(firstProxy.server, secondProxy.server);
    vi.stubEnv('DUCKDUCKGO_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${firstProxy.port}`,
      `http://127.0.0.1:${secondProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('duckduckgo', 0, 2);

    const response = await fetchForEngine(
      'duckduckgo',
      'http://target.example/search',
      undefined,
      { affinityKey },
    );

    expect(response.status).toBe(429);
    expect(firstProxyRequests).toBe(1);
    expect(secondProxyRequests).toBe(0);
  });

  it('times out a hung proxy attempt and rotates to a healthy exit', async () => {
    let hangingConnects = 0;
    let healthyRequests = 0;
    const hangingProxy = await listen(createHangingProxy(() => {
      hangingConnects += 1;
    }));
    const healthyProxy = await listen(createTunnelProxy((_request, socket) => {
      healthyRequests += 1;
      respondThroughTunnel(socket, 200, 'healthy');
    }));
    servers.push(hangingProxy.server, healthyProxy.server);
    vi.stubEnv('SOGOU_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${hangingProxy.port}`,
      `http://127.0.0.1:${healthyProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('sogou', 0, 2);

    const response = await fetchForEngine(
      'sogou',
      'http://target.example/search',
      undefined,
      { affinityKey, attemptTimeoutMs: 50 },
    );

    expect(await response.text()).toBe('healthy');
    expect(hangingConnects).toBe(1);
    expect(healthyRequests).toBe(1);
  });

  it('treats a proxy 407 CONNECT rejection as a transport failure', async () => {
    const rejectingProxy = await listen(createConnectRejectingProxy(407));
    servers.push(rejectingProxy.server);
    vi.stubEnv('SOGOU_PROXY_URL', `http://127.0.0.1:${rejectingProxy.port}`);

    await expect(fetchForEngine('sogou', 'http://target.example/search'))
      .rejects.toMatchObject({ failureType: 'upstream_5xx', retryable: true });
  });

  it('rotates to the next exit when a proxy rejects CONNECT with 407', async () => {
    let rejectingConnects = 0;
    let healthyRequests = 0;
    const rejectingProxy = await listen(createConnectRejectingProxy(407, () => {
      rejectingConnects += 1;
    }));
    const healthyProxy = await listen(createTunnelProxy((_request, socket) => {
      healthyRequests += 1;
      respondThroughTunnel(socket, 200, 'healthy');
    }));
    servers.push(rejectingProxy.server, healthyProxy.server);
    vi.stubEnv('SOGOU_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${rejectingProxy.port}`,
      `http://127.0.0.1:${healthyProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('sogou', 0, 2);

    const response = await fetchForEngine(
      'sogou',
      'http://target.example/search',
      undefined,
      { affinityKey },
    );

    expect(await response.text()).toBe('healthy');
    expect(rejectingConnects).toBe(1);
    expect(healthyRequests).toBe(1);
  });

  it('rotates exits on an opted-in upstream status and returns the success', async () => {
    let firstProxyRequests = 0;
    let secondProxyRequests = 0;
    const firstProxy = await listen(createTunnelProxy((_request, socket) => {
      firstProxyRequests += 1;
      respondThroughTunnel(socket, 429, 'challenge');
    }));
    const secondProxy = await listen(createTunnelProxy((_request, socket) => {
      secondProxyRequests += 1;
      respondThroughTunnel(socket, 200, 'healthy');
    }));
    servers.push(firstProxy.server, secondProxy.server);
    vi.stubEnv('DUCKDUCKGO_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${firstProxy.port}`,
      `http://127.0.0.1:${secondProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('duckduckgo', 0, 2);

    const response = await fetchForEngine(
      'duckduckgo',
      'http://target.example/search',
      undefined,
      { affinityKey, rotateOnStatus: [429], maxStatusRotations: 1 },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('healthy');
    expect(firstProxyRequests).toBe(1);
    expect(secondProxyRequests).toBe(1);
  });

  it('returns the last challenge response when status rotation is exhausted', async () => {
    let firstProxyRequests = 0;
    let secondProxyRequests = 0;
    const firstProxy = await listen(createTunnelProxy((_request, socket) => {
      firstProxyRequests += 1;
      respondThroughTunnel(socket, 429, 'challenge-one');
    }));
    const secondProxy = await listen(createTunnelProxy((_request, socket) => {
      secondProxyRequests += 1;
      respondThroughTunnel(socket, 429, 'challenge-two');
    }));
    servers.push(firstProxy.server, secondProxy.server);
    vi.stubEnv('DUCKDUCKGO_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${firstProxy.port}`,
      `http://127.0.0.1:${secondProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('duckduckgo', 0, 2);

    const response = await fetchForEngine(
      'duckduckgo',
      'http://target.example/search',
      undefined,
      { affinityKey, rotateOnStatus: [429], maxStatusRotations: 1 },
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe('challenge-two');
    expect(firstProxyRequests).toBe(1);
    expect(secondProxyRequests).toBe(1);
  });

  it('skips a degraded exit after its cooldown expires while a healthier exit exists', async () => {
    let degradedRequests = 0;
    let healthyRequests = 0;
    const degradedProxy = await listen(createTunnelProxy((_request, socket) => {
      degradedRequests += 1;
      socket.destroy();
    }));
    const healthyProxy = await listen(createTunnelProxy((_request, socket) => {
      healthyRequests += 1;
      respondThroughTunnel(socket, 200, 'healthy');
    }));
    servers.push(degradedProxy.server, healthyProxy.server);
    vi.stubEnv('SOGOU_PROXY_URLS', JSON.stringify([
      `http://127.0.0.1:${degradedProxy.port}`,
      `http://127.0.0.1:${healthyProxy.port}`,
    ]));
    const affinityKey = affinityForIndex('sogou', 0, 2);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00Z'));
    try {
      // First failure cools the exit for ~30s.
      const first = await fetchForEngine(
        'sogou',
        'http://target.example/search',
        undefined,
        { affinityKey, attemptTimeoutMs: 100 },
      );
      expect(await first.text()).toBe('healthy');
      expect(degradedRequests).toBe(1);

      // Advance past the first cooldown so the exit is tried a second time.
      vi.setSystemTime(new Date('2026-08-08T00:01:00Z'));
      const second = await fetchForEngine(
        'sogou',
        'http://target.example/search',
        undefined,
        { affinityKey, attemptTimeoutMs: 100 },
      );
      expect(await second.text()).toBe('healthy');
      expect(degradedRequests).toBe(2);

      // Expire the second, longer cooldown: consecutive failures persist, so
      // the exit is degraded (not cooled) and must be skipped for the healthy.
      vi.setSystemTime(new Date('2026-08-08T00:10:00Z'));
      const third = await fetchForEngine(
        'sogou',
        'http://target.example/search',
        undefined,
        { affinityKey, attemptTimeoutMs: 100 },
      );
      expect(await third.text()).toBe('healthy');
      expect(degradedRequests).toBe(2);
      expect(healthyRequests).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks passive per-exit health telemetry', async () => {
    const proxy = await listen(createTunnelProxy((_request, socket) => {
      respondThroughTunnel(socket, 200, 'ok');
    }));
    servers.push(proxy.server);
    vi.stubEnv('SOGOU_PROXY_URL', `http://127.0.0.1:${proxy.port}`);

    const response = await fetchForEngine('sogou', 'http://target.example/search');
    expect(await response.text()).toBe('ok');

    const entry = getProxyHealthSnapshot()
      .find(item => item.cacheKey.includes(String(proxy.port)));
    expect(entry).toMatchObject({
      successCount: 1,
      failureCount: 0,
      degraded: false,
    });
    expect(entry!.avgLatencyMs).toBeGreaterThan(0);
  });

  describe('transportBackoffMs', () => {
    it('grows exponentially and respects the cap', () => {
      const minimum = () => 0;
      expect(transportBackoffMs(1, minimum)).toBe(22_500);
      expect(transportBackoffMs(2, minimum)).toBe(45_000);
      expect(transportBackoffMs(3, minimum)).toBe(90_000);
      expect(transportBackoffMs(10, minimum)).toBe(225_000);
    });

    it('applies symmetric jitter around the base', () => {
      const minimum = () => 0;
      const maximum = () => 1;
      expect(transportBackoffMs(1, minimum)).toBeLessThan(
        transportBackoffMs(1, maximum),
      );
      expect(transportBackoffMs(1, maximum)).toBe(37_500);
    });
  });

  it('rejects malformed or duplicate proxy pools without exposing values', async () => {
    vi.stubEnv('DUCKDUCKGO_PROXY_URLS', JSON.stringify([
      'http://proxy-user:proxy-secret@proxy.example:8080',
      'http://proxy-user:proxy-secret@proxy.example:8080',
    ]));

    await expect(fetchForEngine('duckduckgo', 'https://example.com'))
      .rejects.toMatchObject({
        failureType: 'validation_error',
        environmentName: 'DUCKDUCKGO_PROXY_URLS',
      });
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

function affinityForIndex(engine: string, expectedIndex: number, size: number): string {
  for (let index = 0; index < 1000; index += 1) {
    const value = `query-${index}`;
    const digest = createHash('sha256').update(`${engine}\0${value}`).digest();
    if (digest.readUInt32BE(0) % size === expectedIndex) return value;
  }
  throw new Error('Unable to construct deterministic affinity key');
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

function createHangingProxy(onConnect?: () => void): Server {
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
  server.on('connect', (_request, socket) => {
    onConnect?.();
    // Deliberately never answer the CONNECT handshake, so the request hangs
    // until the per-attempt timeout aborts it and the pool rotates.
  });
  return server;
}

function createConnectRejectingProxy(status: number, onConnect?: () => void): Server {
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
  server.on('connect', (_request, socket) => {
    onConnect?.();
    socket.end(
      `HTTP/1.1 ${status} Proxy Authentication Required\r\n`
      + 'Connection: close\r\n'
      + '\r\n',
    );
  });
  return server;
}

const tunnelSockets = new WeakMap<Server, Set<Socket>>();

function respondThroughTunnel(
  socket: Socket,
  status: number,
  body = '',
): void {
  const reason = status === 204
    ? 'No Content'
    : status === 429
      ? 'Too Many Requests'
      : 'OK';
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
