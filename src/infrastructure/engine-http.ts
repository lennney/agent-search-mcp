import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import {
  fetch as undiciFetch,
  ProxyAgent,
  type RequestInit as UndiciRequestInit,
} from 'undici';

export type ProxyAwareEngine = 'duckduckgo' | 'sogou';
export type ProxyConfigurationStatus = 'present' | 'missing' | 'invalid';

export interface EngineProxyInspection {
  status: ProxyConfigurationStatus;
  provenance: string[];
}

export interface EngineTransportOptions {
  /** Keeps every request in one logical provider query on the same first exit. */
  affinityKey?: string;
}

const ENGINE_PROXY_ENV: Record<ProxyAwareEngine, string> = {
  duckduckgo: 'DUCKDUCKGO_PROXY_URL',
  sogou: 'SOGOU_PROXY_URL',
};
const ENGINE_PROXY_POOL_ENV: Record<ProxyAwareEngine, string> = {
  duckduckgo: 'DUCKDUCKGO_PROXY_URLS',
  sogou: 'SOGOU_PROXY_URLS',
};
const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890';
const TRANSPORT_FAILURE_COOLDOWN_MS = 60_000;
const proxyAgents = new Map<string, ProxyAgent>();
const failedProxyUntil = new Map<string, number>();

/**
 * Shared outbound HTTP seam for the core zero-key engines.
 *
 * Direct requests retain the runtime's global fetch implementation. Proxy
 * requests use a request-local Undici dispatcher, so proxy configuration never
 * mutates global fetch behavior for MCP/HTTP server traffic.
 */
export async function fetchForEngine(
  engine: ProxyAwareEngine,
  input: string | URL,
  init?: RequestInit,
  transportOptions?: EngineTransportOptions,
): Promise<Response> {
  const proxies = resolveProxies(engine);
  if (proxies.length === 0) return globalThis.fetch(input, init);

  const ordered = orderProxyPool(engine, proxies, transportOptions?.affinityKey);
  for (const [index, proxy] of ordered.entries()) {
    try {
      const dispatcher = getProxyAgent(proxy);
      const response = await undiciFetch(input, {
        ...(init as unknown as UndiciRequestInit),
        dispatcher,
      });
      failedProxyUntil.delete(proxy.cacheKey);
      return response as unknown as Response;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      failedProxyUntil.set(proxy.cacheKey, Date.now() + TRANSPORT_FAILURE_COOLDOWN_MS);
      if (index === ordered.length - 1) {
        throw new ProxyTransportError(engine);
      }
    }
  }
  throw new ProxyTransportError(engine);
}

/** Destroy cached proxy connection pools, primarily for shutdown/tests. */
export async function closeEngineHttpTransport(): Promise<void> {
  const agents = [...proxyAgents.values()];
  proxyAgents.clear();
  failedProxyUntil.clear();
  await Promise.all(agents.map(agent => agent.destroy()));
}

interface ProxyConfiguration {
  cacheKey: string;
  uri: string;
  token?: string;
  environmentName: string;
}

class ProxyTransportError extends Error {
  readonly failureType = 'upstream_5xx';
  readonly retryable = true;
  readonly suggestion = 'Check the configured proxy pool or use direct transport';

  constructor(engine: ProxyAwareEngine) {
    super(`All configured proxy transports failed for ${engine}`);
    this.name = 'ProxyTransportError';
  }
}

class ProxyConfigurationError extends Error {
  readonly failureType = 'validation_error';
  readonly retryable = false;
  readonly suggestion =
    'Use an http:// or https:// proxy URL in the documented proxy setting';
  readonly environmentName: string;

  constructor(environmentName: string) {
    super(`Invalid proxy configuration in ${environmentName}`);
    this.name = 'ProxyConfigurationError';
    this.environmentName = environmentName;
  }
}

export function inspectEngineProxyConfiguration(
  engine: ProxyAwareEngine,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EngineProxyInspection {
  try {
    const configurations = resolveProxies(engine, environment);
    return configurations.length > 0
      ? {
          status: 'present',
          provenance: [...new Set(configurations.map(configuration => (
            `environment:${configuration.environmentName}`
          )))],
        }
      : {
          status: 'missing',
          provenance: ['built-in:direct'],
        };
  } catch (error) {
    const environmentName = error instanceof ProxyConfigurationError
      ? error.environmentName
      : ENGINE_PROXY_ENV[engine];
    return {
      status: 'invalid',
      provenance: [`environment:${environmentName}`],
    };
  }
}

function resolveProxies(
  engine: ProxyAwareEngine,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProxyConfiguration[] {
  const engineEnvironment = ENGINE_PROXY_ENV[engine];
  const engineProxy = environment[engineEnvironment]?.trim();
  if (engineProxy) return [parseProxy(engineProxy, engineEnvironment)];

  const poolEnvironment = ENGINE_PROXY_POOL_ENV[engine];
  const engineProxyPool = environment[poolEnvironment]?.trim();
  if (engineProxyPool) return parseProxyPool(engineProxyPool, poolEnvironment);

  if (
    environment.USE_PROXY !== undefined
    && !['true', 'false'].includes(environment.USE_PROXY)
  ) {
    throw new ProxyConfigurationError('USE_PROXY');
  }
  if (environment.USE_PROXY !== 'true') return [];
  const configuredGlobalProxy = environment.PROXY_URL?.trim();
  return [parseProxy(
    configuredGlobalProxy || DEFAULT_PROXY_URL,
    configuredGlobalProxy ? 'PROXY_URL' : 'USE_PROXY',
  )];
}

function parseProxyPool(rawValue: string, environmentName: string): ProxyConfiguration[] {
  try {
    const values: unknown = JSON.parse(rawValue);
    if (!Array.isArray(values)
      || values.length < 2
      || values.length > 16
      || values.some(value => typeof value !== 'string' || value.trim() === '')) {
      throw new Error('Proxy pool must contain 2 to 16 URLs');
    }
    const configurations = values.map(value => parseProxy(value, environmentName));
    if (new Set(configurations.map(configuration => configuration.cacheKey)).size
      !== configurations.length) {
      throw new Error('Proxy pool contains duplicates');
    }
    return configurations;
  } catch {
    throw new ProxyConfigurationError(environmentName);
  }
}

function orderProxyPool(
  engine: ProxyAwareEngine,
  proxies: ProxyConfiguration[],
  affinityKey = '',
): ProxyConfiguration[] {
  if (proxies.length < 2) return proxies;
  const digest = createHash('sha256').update(`${engine}\0${affinityKey}`).digest();
  const start = digest.readUInt32BE(0) % proxies.length;
  const rotated = [...proxies.slice(start), ...proxies.slice(0, start)];
  const now = Date.now();
  const healthy = rotated.filter(proxy => (failedProxyUntil.get(proxy.cacheKey) ?? 0) <= now);
  return healthy.length > 0 ? healthy : rotated;
}

function parseProxy(
  rawProxyUrl: string,
  environmentName: string,
): ProxyConfiguration {
  try {
    const proxyUrl = new URL(rawProxyUrl);
    if (!['http:', 'https:'].includes(proxyUrl.protocol)
      || proxyUrl.hostname === ''
      || (proxyUrl.pathname !== '' && proxyUrl.pathname !== '/')
      || proxyUrl.search !== ''
      || proxyUrl.hash !== '') {
      throw new Error('Unsupported proxy URL shape');
    }

    const username = decodeURIComponent(proxyUrl.username);
    const password = decodeURIComponent(proxyUrl.password);
    proxyUrl.username = '';
    proxyUrl.password = '';
    const uri = proxyUrl.toString();
    const token = username || password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : undefined;
    return {
      cacheKey: `${uri}\0${token ?? ''}`,
      uri,
      token,
      environmentName,
    };
  } catch {
    throw new ProxyConfigurationError(environmentName);
  }
}

function getProxyAgent(configuration: ProxyConfiguration): ProxyAgent {
  const cached = proxyAgents.get(configuration.cacheKey);
  if (cached) return cached;

  const agent = new ProxyAgent({
    uri: configuration.uri,
    ...(configuration.token ? { token: configuration.token } : {}),
    proxyTunnel: true,
  });
  proxyAgents.set(configuration.cacheKey, agent);
  return agent;
}
