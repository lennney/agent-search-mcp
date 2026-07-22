import * as http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface HttpServerOptions {
  port: number;
  enableCors: boolean;
  corsOrigin: string;
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
  const { port, enableCors, corsOrigin } = options;

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

    // CORS headers
    if (enableCors) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
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
      res.end(JSON.stringify({ status: 'ok', version: '3.1.1' }));
      return;
    }

    // MCP Streamable HTTP — route GET/POST/DELETE /mcp to transport
    if (transport && (req.url === '/mcp' || req.url?.startsWith('/mcp?'))) {
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
      });
    },
    getPort: () => actualPort,
  };
}