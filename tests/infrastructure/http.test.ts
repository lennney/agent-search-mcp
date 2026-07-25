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
      expect(body.version).toBe('3.1.3');
      expect(body.protocol).toEqual({
        stable: '2025-11-25',
        target: '2026-07-28',
        target_status: 'experimental',
      });
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
    const server = createHttpServer(null, {
      port: 0,
      enableCors: true,
      corsOrigin: 'https://example.com',
      allowedOrigins: ['https://example.com'],
    });
    await server.listen();
    
    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`, {
        headers: { Origin: 'https://example.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
      expect(res.headers.get('access-control-allow-headers')).toContain('MCP-Protocol-Version');
      expect(res.headers.get('access-control-allow-headers')).toContain('Mcp-Method');
      expect(res.headers.get('access-control-allow-headers')).toContain('Mcp-Name');
      expect(res.headers.get('access-control-allow-headers')).toContain('traceparent');
    } finally {
      await server.close();
    }
  });

  it('rejects browser requests from an untrusted Origin', async () => {
    const server = createHttpServer(null, {
      port: 0,
      enableCors: true,
      corsOrigin: 'https://example.com',
      allowedOrigins: ['https://example.com'],
    });
    await server.listen();

    try {
      const res = await fetch(`http://localhost:${server.getPort()}/health`, {
        headers: { Origin: 'https://evil.example' },
      });
      expect(res.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it('requires a valid Bearer token for MCP routes when configured', async () => {
    const server = createHttpServer(null, {
      port: 0,
      enableCors: false,
      corsOrigin: '*',
      authToken: 'test-secret',
    });
    await server.listen();

    try {
      const missing = await fetch(`http://localhost:${server.getPort()}/mcp`);
      expect(missing.status).toBe(401);

      const wrong = await fetch(`http://localhost:${server.getPort()}/mcp`, {
        headers: { Authorization: 'Bearer wrong-secret' },
      });
      expect(wrong.status).toBe(401);

      const valid = await fetch(`http://localhost:${server.getPort()}/mcp`, {
        headers: { Authorization: 'bearer test-secret' },
      });
      expect(valid.status).toBe(404);
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
