import { Buffer } from 'node:buffer';

import {
  fetch as undiciFetch,
  ProxyAgent,
  type RequestInit as UndiciRequestInit,
} from 'undici';

export type ProxyAwareEngine = 'duckduckgo' | 'sogou';

const ENGINE_PROXY_ENV: Record<ProxyAwareEngine, string> = {
  duckduckgo: 'DUCKDUCKGO_PROXY_URL',
  sogou: 'SOGOU_PROXY_URL',
};
const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890';
const proxyAgents = new Map<string, ProxyAgent>();

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
): Promise<Response> {
  const proxy = resolveProxy(engine);
  if (!proxy) return globalThis.fetch(input, init);

  const dispatcher = getProxyAgent(proxy);
  const response = await undiciFetch(input, {
    ...(init as unknown as UndiciRequestInit),
    dispatcher,
  });
  return response as unknown as Response;
}

/** Destroy cached proxy connection pools, primarily for shutdown/tests. */
export async function closeEngineHttpTransport(): Promise<void> {
  const agents = [...proxyAgents.values()];
  proxyAgents.clear();
  await Promise.all(agents.map(agent => agent.destroy()));
}

interface ProxyConfiguration {
  cacheKey: string;
  uri: string;
  token?: string;
}

class ProxyConfigurationError extends Error {
  readonly failureType = 'validation_error';
  readonly retryable = false;
  readonly suggestion =
    'Use an http:// or https:// proxy URL in the documented proxy setting';

  constructor(environmentName: string) {
    super(`Invalid proxy configuration in ${environmentName}`);
    this.name = 'ProxyConfigurationError';
  }
}

function resolveProxy(engine: ProxyAwareEngine): ProxyConfiguration | null {
  const engineEnvironment = ENGINE_PROXY_ENV[engine];
  const engineProxy = process.env[engineEnvironment]?.trim();
  if (engineProxy) return parseProxy(engineProxy, engineEnvironment);

  if (process.env.USE_PROXY !== 'true') return null;
  const globalProxy = process.env.PROXY_URL?.trim() || DEFAULT_PROXY_URL;
  return parseProxy(globalProxy, 'PROXY_URL');
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
