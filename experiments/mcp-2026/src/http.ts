import * as http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  hostHeaderValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';

import {
  createExperimentalHandler,
  type ExperimentalHandler,
} from './server.js';

const CORS_REQUEST_HEADERS = [
  'Authorization',
  'Content-Type',
  'MCP-Protocol-Version',
  'Mcp-Method',
  'Mcp-Name',
  'traceparent',
  'tracestate',
  'baggage',
].join(', ');
const HEADER_MISMATCH_ERROR_CODE = -32020;

export interface ExperimentalHttpConfig {
  host: string;
  port: number;
  authToken: string;
  allowUnauthenticated: boolean;
  allowedHosts: string[];
  allowedOrigins: string[];
  maxBodyBytes?: number;
}

export interface ExperimentalNodeServer {
  listen: () => Promise<void>;
  close: () => Promise<void>;
  getPort: () => number;
}

/**
 * Parse the isolated experimental HTTP configuration.
 */
export function loadExperimentalHttpConfig(
  env: Record<string, string | undefined> = process.env,
): ExperimentalHttpConfig {
  const host = env.HOST?.trim() || '127.0.0.1';
  const port = parsePort(env.PORT);
  const authToken = env.HTTP_AUTH_TOKEN?.trim() || '';
  const allowUnauthenticated = env.HTTP_ALLOW_UNAUTHENTICATED === 'true';
  if (!authToken && !allowUnauthenticated) {
    throw new Error(
      'Experimental HTTP mode requires HTTP_AUTH_TOKEN. '
      + 'Set HTTP_ALLOW_UNAUTHENTICATED=true only for a trusted local test.',
    );
  }

  const configuredHosts = parseCsv(env.ALLOWED_HOSTS);
  const allowedHosts = configuredHosts.length > 0
    ? configuredHosts
    : defaultAllowedHosts(host);
  if (allowedHosts.length === 0) {
    throw new Error(
      'Non-local HOST requires an explicit ALLOWED_HOSTS list.',
    );
  }

  return {
    host,
    port,
    authToken,
    allowUnauthenticated,
    allowedHosts,
    allowedOrigins: parseCsv(env.ALLOWED_ORIGINS),
    maxBodyBytes: parsePositiveInteger(env.HTTP_MAX_BODY_BYTES, 1_048_576),
  };
}

/**
 * Adapt the web-standard SDK v2 handler to a guarded Node HTTP server.
 */
export function createExperimentalNodeServer(
  handler: ExperimentalHandler,
  config: ExperimentalHttpConfig,
): ExperimentalNodeServer {
  const validateHost = hostHeaderValidation(config.allowedHosts);
  const nodeHandler = toNodeHandler(handler, {
    onerror: error => {
      console.error('Experimental MCP HTTP adapter error:', error.message);
    },
  });
  const maxBodyBytes = config.maxBodyBytes ?? 1_048_576;

  const server = http.createServer(async (request, response) => {
    request.on('error', () => {});
    response.on('error', () => {});

    if (!validateHost(request, response)) return;

    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      writeJson(response, 403, { error: 'Origin not allowed' });
      return;
    }

    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', CORS_REQUEST_HEADERS);
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, {
        status: 'experimental',
        protocol: '2026-07-28',
        legacy_fallback: '2025-11-25',
        sdk: '2.0.0-beta.5',
      });
      return;
    }

    const isMcpRoute = request.url === '/mcp' || request.url?.startsWith('/mcp?');
    if (!isMcpRoute) {
      writeJson(response, 404, { error: 'Not found' });
      return;
    }

    const duplicateRoutingHeader = findDuplicateRoutingHeader(request.rawHeaders);
    if (duplicateRoutingHeader !== undefined) {
      writeJson(response, 400, {
        jsonrpc: '2.0',
        error: {
          code: HEADER_MISMATCH_ERROR_CODE,
          message: `Bad Request: duplicate MCP routing header ${duplicateRoutingHeader}`,
          data: {
            header: duplicateRoutingHeader,
          },
        },
        id: null,
      });
      return;
    }

    if (request.method === 'POST') {
      if (request.headers['transfer-encoding'] !== undefined) {
        writeJson(response, 411, {
          error: 'Content-Length is required; chunked request bodies are not accepted',
        });
        return;
      }

      const rawContentLength = request.headers['content-length'];
      if (rawContentLength === undefined) {
        writeJson(response, 411, { error: 'Content-Length is required' });
        return;
      }

      const contentLength = Number(rawContentLength);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        writeJson(response, 400, { error: 'Invalid Content-Length' });
        return;
      }
      if (contentLength > maxBodyBytes) {
        writeJson(response, 413, { error: 'Request body too large' });
        return;
      }
    }

    if (
      !config.allowUnauthenticated
      && !hasValidBearerToken(request.headers.authorization, config.authToken)
    ) {
      response.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      });
      response.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    await nodeHandler(request, response);
  });

  server.on('error', error => {
    console.error('Experimental MCP HTTP server error:', error.message);
  });

  let actualPort = config.port;
  return {
    listen: async () => {
      await new Promise<void>((resolveListen, rejectListen) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          rejectListen(error);
        };
        const onListening = () => {
          server.off('error', onError);
          const address = server.address();
          if (address && typeof address === 'object') {
            actualPort = address.port;
          }
          resolveListen();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(config.port, config.host);
      });
    },
    close: async () => {
      await handler.close();
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close(error => {
          if (error) rejectClose(error);
          else resolveClose();
        });
        server.closeIdleConnections();
      });
    },
    getPort: () => actualPort,
  };
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3100);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function defaultAllowedHosts(host: string): string[] {
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    return ['127.0.0.1', 'localhost', '[::1]'];
  }
  return [];
}

function findDuplicateRoutingHeader(rawHeaders: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]?.toLowerCase();
    if (
      name !== 'mcp-protocol-version'
      && name !== 'mcp-method'
      && name !== 'mcp-name'
      && !name?.startsWith('mcp-param-')
    ) {
      continue;
    }

    const count = (counts.get(name) ?? 0) + 1;
    if (count > 1) return name;
    counts.set(name, count);
  }
  return undefined;
}

function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function writeJson(
  response: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  const config = loadExperimentalHttpConfig();
  const handler = createExperimentalHandler({
    onerror: error => {
      console.error('Experimental MCP protocol error:', error.message);
    },
  });
  const server = createExperimentalNodeServer(handler, config);
  await server.listen();
  console.error(
    `Experimental MCP 2026 HTTP server listening on http://${config.host}:${server.getPort()}/mcp`,
  );

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (directEntry) {
  void main().catch(error => {
    console.error('Experimental MCP HTTP fatal error:', error);
    process.exit(1);
  });
}
