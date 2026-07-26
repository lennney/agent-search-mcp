import * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from './logger.js';
import { getProtocolReadiness } from './protocol.js';
import { readCurrentVersion } from './version-check.js';

const CORS_REQUEST_HEADERS = [
  'Authorization',
  'Content-Type',
  'Mcp-Session-Id',
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'traceparent',
  'tracestate',
  'baggage',
].join(', ');

export interface HttpServerOptions {
  port: number;
  enableCors: boolean;
  corsOrigin: string;
  allowedOrigins?: string[];
  authToken?: string;
}

export interface HttpServer {
  listen: () => Promise<void>;
  close: () => Promise<void>;
  getPort: () => number;
}

export type McpServerFactory = () => McpServer;

/**
 * Create an HTTP server with optional Streamable HTTP transport (MCP 2025-11-25 spec).
 *
 * When `createMcpServer` is provided:
 *   - /mcp requests are handled by a fresh stateless server and transport
 *   - POST /mcp accepts JSON-RPC messages and Streamable HTTP responses
 *
 * When `createMcpServer` is omitted (CLI serve mode):
 *   - Only health check endpoint is available
 */
export function createHttpServer(
  createMcpServer: McpServerFactory | null,
  options: HttpServerOptions,
): HttpServer {
  const { port, enableCors, corsOrigin, authToken = '' } = options;
  const allowedOrigins = options.allowedOrigins ?? (corsOrigin ? [corsOrigin] : []);
  const hasMcpServer = createMcpServer !== null;

  const httpServer = http.createServer(async (req, res) => {
    // Handle request errors (e.g., ECONNRESET)
    req.on('error', () => { /* swallow */ });
    res.on('error', () => { /* swallow */ });

    const requestOrigin = req.headers.origin;
    const originAllowed = !requestOrigin || allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin);
    if (!originAllowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return;
    }

    // CORS headers are emitted only for an allowed browser origin.
    if (enableCors && requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes('*') ? '*' : requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', CORS_REQUEST_HEADERS);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    }

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: readCurrentVersion(),
        protocol: getProtocolReadiness(),
      }));
      return;
    }

    const isMcpRoute = req.url === '/mcp' || req.url?.startsWith('/mcp?');
    if (isMcpRoute && authToken && !hasValidBearerToken(req.headers.authorization, authToken)) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // MCP Streamable HTTP — route GET/POST/DELETE /mcp to transport
    // Keep the SDK v1 transport untouched during an SDK v2 era probe.
    // Passing server/discover into the v1 transport makes that transport return
    // 500 for the following legacy initialize request. A normal JSON-RPC
    // method-not-found response is definitive legacy evidence to an auto-mode
    // v2 client, which can then initialize cleanly on the same HTTP endpoint.
    if (
      hasMcpServer
      && isMcpRoute
      && req.method === 'POST'
      && req.headers['mcp-method'] === 'server/discover'
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found: server/discover',
        },
        id: null,
      }));
      return;
    }

    if (createMcpServer && isMcpRoute) {
      const mcpServer = createMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      try {
        await mcpServer.connect(transport);
        await handleWebStandardRequest(req, res, transport);
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'Streamable HTTP transport error',
        );
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      } finally {
        await transport.close();
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.on('error', (err) => {
    logger.error({ err: err.message }, 'HTTP server error');
  });

  let actualPort = port;

  return {
    listen: async () => {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, () => {
          const addr = httpServer.address();
          if (addr && typeof addr === 'object') {
            actualPort = addr.port;
          }
          logger.info(
            {
              port: actualPort,
              transport: hasMcpServer ? 'streamable-http' : 'http',
            },
            'HTTP server listening',
          );
          resolve();
        });
      });
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
        // Node.js 18 otherwise waits for the keep-alive timeout before closing.
        httpServer.closeIdleConnections();
      });
    },
    getPort: () => actualPort,
  };
}

function hasValidBearerToken(authorization: string | undefined, expectedToken: string): boolean {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function handleWebStandardRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  transport: WebStandardStreamableHTTPServerTransport,
): Promise<void> {
  const host = request.headers.host;
  if (!host) {
    throw new Error('Missing Host header');
  }

  const headers = new Headers();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    headers.append(request.rawHeaders[index], request.rawHeaders[index + 1]);
  }

  const abortController = new AbortController();
  request.once('aborted', () => {
    abortController.abort(new Error('Client aborted request'));
  });

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    signal: abortController.signal,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }

  const webRequest = new Request(
    new URL(request.url ?? '/', `http://${host}`),
    init,
  );
  const webResponse = await transport.handleRequest(webRequest);

  for (const [name, value] of webResponse.headers) {
    response.setHeader(name, value);
  }
  response.writeHead(webResponse.status);

  if (!webResponse.body) {
    response.end();
    return;
  }

  const reader = webResponse.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!response.write(value)) {
        await once(response, 'drain');
      }
    }
    response.end();
  } finally {
    reader.releaseLock();
  }
}
