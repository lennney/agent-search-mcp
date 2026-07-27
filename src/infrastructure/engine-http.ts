import { Buffer } from 'node:buffer';

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
  environmentName: string;
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
    const configuration = resolveProxy(engine, environment);
    return configuration
      ? {
          status: 'present',
          provenance: [`environment:${configuration.environmentName}`],
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

function resolveProxy(
  engine: ProxyAwareEngine,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProxyConfiguration | null {
  const engineEnvironment = ENGINE_PROXY_ENV[engine];
  const engineProxy = environment[engineEnvironment]?.trim();
  if (engineProxy) return parseProxy(engineProxy, engineEnvironment);

  if (
    environment.USE_PROXY !== undefined
    && !['true', 'false'].includes(environment.USE_PROXY)
  ) {
    throw new ProxyConfigurationError('USE_PROXY');
  }
  if (environment.USE_PROXY !== 'true') return null;
  const configuredGlobalProxy = environment.PROXY_URL?.trim();
  return parseProxy(
    configuredGlobalProxy || DEFAULT_PROXY_URL,
    configuredGlobalProxy ? 'PROXY_URL' : 'USE_PROXY',
  );
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
