import * as http from 'node:http';

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

export function createHttpServer(options: HttpServerOptions): HttpServer {
  const { port, enableCors, corsOrigin } = options;
  
  const server = http.createServer((req, res) => {
    // Handle request errors (e.g., ECONNRESET)
    req.on('error', () => { /* swallow */ });
    res.on('error', () => { /* swallow */ });
    
    // CORS headers
    if (enableCors) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      res.end(JSON.stringify({ status: 'ok', version: '3.0.0' }));
      return;
    }

    // SSE endpoint placeholder
    if (req.method === 'GET' && req.url === '/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // Handle server-level errors (e.g., port conflicts)
  server.on('error', (err) => {
    console.error('HTTP server error:', err.message);
  });

  let actualPort = port;

  return {
    listen: () => new Promise<void>((resolve) => {
      server.listen(port, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          actualPort = addr.port;
        }
        console.error(`🔍 HTTP server running on port ${actualPort}`);
        resolve();
      });
    }),
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    }),
    getPort: () => actualPort,
  };
}
