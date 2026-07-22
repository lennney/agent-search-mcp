import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import { createHttpServer } from '../../src/infrastructure/http.js';

describe('createHttpServer', () => {
  it('returns server instance with listen method', () => {
    const server = createHttpServer(null, { port: 0, enableCors: false, corsOrigin: '*' });
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
    expect(typeof server.getPort).toBe('function');
  });

  it('GET /health returns 200 with JSON', async () => {
    const server = createHttpServer(null, { port: 0, enableCors: false, corsOrigin: '*' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.version).toBe('3.1.1');
    } finally {
      await server.close();
    }
  });

it('GET /mcp without transport returns 404', async () => {
    const server = createHttpServer(null, { port: 0, enableCors: false, corsOrigin: '*' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/mcp`);
      // No transport connected: /mcp falls through to 404
      expect(res.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('CORS headers present when enableCors=true', async () => {
    const server = createHttpServer(null, { port: 0, enableCors: true, corsOrigin: 'https://example.com' });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
    } finally {
      await server.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const server = createHttpServer(null, { port: 0, enableCors: false, corsOrigin: '*' });
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
