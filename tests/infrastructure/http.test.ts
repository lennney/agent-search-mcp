import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import { createHttpServer } from '../../src/infrastructure/http.js';

describe('createHttpServer', () => {
  it('returns server instance with listen method', () => {
    const server = createHttpServer({ port: 0, enableCors: false, corsOrigin: '*' });
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
    expect(typeof server.getPort).toBe('function');
  });

  it('GET /health returns 200 with JSON', async () => {
    const server = createHttpServer({ port: 0, enableCors: false, corsOrigin: '*' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.version).toBe('2.1.0');
    } finally {
      await server.close();
    }
  });

  it('GET /sse returns SSE content-type header', async () => {
    const server = createHttpServer({ port: 0, enableCors: false, corsOrigin: '*' });
    await server.listen();
    
    try {
      // Use http.get to check headers without waiting for body
      await new Promise<void>((resolve, reject) => {
        http.get(`http://localhost:${server.getPort()}/sse`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          res.destroy(); // Close connection immediately
          resolve();
        }).on('error', reject);
      });
    } finally {
      await server.close();
    }
  });

  it('CORS headers present when enableCors=true', async () => {
    const server = createHttpServer({ port: 0, enableCors: true, corsOrigin: 'https://example.com' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
    } finally {
      await server.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const server = createHttpServer({ port: 0, enableCors: false, corsOrigin: '*' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/unknown`);
      expect(res.status).toBe(404);
      
      const body = await res.json();
      expect(body.error).toBe('Not found');
    } finally {
      await server.close();
    }
  });
});
