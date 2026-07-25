import * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

/**
 * Create an HTTP server with optional Streamable HTTP transport (MCP 2025-11-25 spec).
 *
 * When `mcpServer` is provided:
 *   - POST /mcp: JSON-RPC messages + SSE streaming (Streamable HTTP)
 *   - GET /mcp: SSE reconnection
 *   - DELETE /mcp: session termination
 *
 * When `mcpServer` is omitted (CLI serve mode):
 *   - Only health check endpoint is available
 */
export function createHttpServer(mcpServer: McpServer | null, options: HttpServerOptions): HttpServer {
  const { port, enableCors, corsOrigin, authToken = '' } = options;
  const allowedOrigins = options.allowedOrigins ?? (corsOrigin ? [corsOrigin] : []);

  let transport: StreamableHTTPServerTransport | null = null;

  if (mcpServer) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
  }

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
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id');
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
      res.end(JSON.stringify({ status: 'ok', version: '3.1.3' }));
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
    if (transport && isMcpRoute) {
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        console.error('Streamable HTTP transport error:', err instanceof Error ? err.message : String(err));
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.on('error', (err) => {
    console.error('HTTP server error:', err.message);
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
          console.error(transport
            ? `🔍 Streamable HTTP server running on port ${actualPort}`
            : `🔍 HTTP server running on port ${actualPort}`
          );
          resolve();
        });
      });
      if (transport && mcpServer) {
        await mcpServer.connect(transport);
      }
    },
    close: async () => {
      if (transport) {
        await transport.close();
      }
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
