import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import {
  fetch as undiciFetch,
  ProxyAgent,
  type RequestInit as UndiciRequestInit,
} from 'undici';

export type ProxyAwareEngine = 'duckduckgo' | 'sogou' | 'mojeek';
export type ProxyConfigurationStatus = 'present' | 'missing' | 'invalid';

export interface EngineProxyInspection {
  status: ProxyConfigurationStatus;
  provenance: string[];
}

export interface EngineTransportOptions {
  /** Keeps every request in one logical provider query on the same first exit. */
  affinityKey?: string;
  /** Per-attempt connect/response timeout; a timed-out attempt rotates to the next exit. */
  attemptTimeoutMs?: number;
  /** Rotate to another exit when an upstream response carries one of these statuses. */
  rotateOnStatus?: readonly number[];
  /**
   * Cap on status-based rotations per call. Defaults to 1 when `rotateOnStatus`
   * is provided, 0 otherwise; an explicit 0 disables rotation.
   */
  maxStatusRotations?: number;
}

const ENGINE_PROXY_ENV: Record<ProxyAwareEngine, string> = {
  duckduckgo: 'DUCKDUCKGO_PROXY_URL',
  sogou: 'SOGOU_PROXY_URL',
  mojeek: 'MOJEEK_PROXY_URL',
};
const ENGINE_PROXY_POOL_ENV: Record<ProxyAwareEngine, string> = {
  duckduckgo: 'DUCKDUCKGO_PROXY_URLS',
  sogou: 'SOGOU_PROXY_URLS',
  mojeek: 'MOJEEK_PROXY_URLS',
};
const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890';
const DEFAULT_ATTEMPT_TIMEOUT_MS = 6_000;
const TRANSPORT_BACKOFF_BASE_MS = 30_000;
const TRANSPORT_BACKOFF_MAX_MS = 300_000;
const TRANSPORT_BACKOFF_JITTER = 0.25;
const ATTEMPT_TIMEOUT_REASON = new DOMException(
  'Engine proxy attempt timed out',
  'TimeoutError',
);
const proxyAgents = new Map<string, ProxyAgent>();
const failedProxyUntil = new Map<string, number>();
const consecutiveFailures = new Map<string, number>();

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

  const callerSignal = init?.signal;
  const ordered = orderProxyPool(engine, proxies, transportOptions?.affinityKey);
  const attemptTimeoutMs = transportOptions?.attemptTimeoutMs
    ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const rotateOnStatus = transportOptions?.rotateOnStatus;
  const maxStatusRotations = transportOptions?.maxStatusRotations
    ?? (rotateOnStatus && rotateOnStatus.length > 0 ? 1 : 0);

  let statusRotations = 0;
  for (const [index, proxy] of ordered.entries()) {
    const attemptController = new AbortController();
    const timer = setTimeout(() => {
      attemptController.abort(ATTEMPT_TIMEOUT_REASON);
    }, attemptTimeoutMs);
    const onCallerAbort = () => attemptController.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timer);
        throw callerSignal.reason
          ?? new DOMException('The operation was aborted', 'AbortError');
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
      const dispatcher = getProxyAgent(proxy);
      const response = await undiciFetch(input, {
        ...(init as unknown as UndiciRequestInit),
        dispatcher,
        signal: attemptController.signal,
      }) as unknown as Response;

      if (response.status === 407) {
        // Proxy authentication failure is a transport problem, not an upstream
        // verdict: cancel the body and advance to the next configured exit.
        response.body?.cancel();
        coolProxy(proxy);
        if (index === ordered.length - 1) throw new ProxyTransportError(engine);
        continue;
      }
      if (rotateOnStatus?.includes(response.status)) {
        if (statusRotations < maxStatusRotations && index < ordered.length - 1) {
          // The upstream challenged this exit. Rotate without cooling the proxy:
          // it is fine; the IP/reputation it carries is not.
          response.body?.cancel();
          statusRotations += 1;
          continue;
        }
        // Rotation budget exhausted or last exit: hand the challenge response
        // back so the adapter still classifies bot_challenge and suspends.
        return response;
      }
      failedProxyUntil.delete(proxy.cacheKey);
      consecutiveFailures.delete(proxy.cacheKey);
      return response;
    } catch (error) {
      if (callerSignal?.aborted) throw error;
      coolProxy(proxy);
      if (index === ordered.length - 1) throw new ProxyTransportError(engine);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }
  throw new ProxyTransportError(engine);
}

function coolProxy(proxy: ProxyConfiguration): void {
  const failures = (consecutiveFailures.get(proxy.cacheKey) ?? 0) + 1;
  consecutiveFailures.set(proxy.cacheKey, failures);
  failedProxyUntil.set(
    proxy.cacheKey,
    Date.now() + transportBackoffMs(failures),
  );
}

/**
 * Bounded exponential backoff (base * 2^n, capped) with jitter for a proxy that
 * keeps failing at the transport layer. Mirrors the provider circuit breaker's
 * 30s initial / 5min cap so repeated failures back off while one-off drops heal
 * quickly.
 */
export function transportBackoffMs(
  consecutiveFailures: number,
  rng: () => number = Math.random,
): number {
  const base = Math.min(
    TRANSPORT_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1),
    TRANSPORT_BACKOFF_MAX_MS,
  );
  const jitter = base * TRANSPORT_BACKOFF_JITTER * (2 * rng() - 1);
  return Math.round(Math.max(0, base + jitter));
}

/** Destroy cached proxy connection pools, primarily for shutdown/tests. */
export async function closeEngineHttpTransport(): Promise<void> {
  const agents = [...proxyAgents.values()];
  proxyAgents.clear();
  failedProxyUntil.clear();
  consecutiveFailures.clear();
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
