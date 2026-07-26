import { withTimeout } from '../infrastructure/abort.js';
import {
  EngineAdapterError,
  isEngineAdapterError,
} from './engine-error.js';

export type JsonObject = Record<string, unknown>;

interface FetchSearchJsonOptions {
  provider: string;
  url: string | URL;
  init: RequestInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryServerErrors?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;

function parseRetryAfter(response: Response): number {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (!retryAfter) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      Math.max(Math.ceil(seconds * 1_000), 1_000),
      MAX_RATE_LIMIT_COOLDOWN_MS,
    );
  }

  const retryAt = Date.parse(retryAfter);
  if (!Number.isFinite(retryAt)) return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  return Math.min(
    Math.max(retryAt - Date.now(), 1_000),
    MAX_RATE_LIMIT_COOLDOWN_MS,
  );
}

function createHttpError(
  provider: string,
  response: Response,
  retryServerErrors: boolean,
): EngineAdapterError {
  const status = response.status;
  if (status === 401 || status === 403) {
    return new EngineAdapterError(
      'permission_denied',
      `${provider} rejected the configured credential`,
      {
        retryable: false,
        suggestion: `Check the ${provider} credential and account access`,
      },
    );
  }
  if (status === 429) {
    return new EngineAdapterError(
      'rate_limited',
      `${provider} rate limit reached`,
      {
        retryable: false,
        cooldownMs: parseRetryAfter(response),
        suggestion: 'Use another provider or retry after the cooldown expires',
      },
    );
  }
  if (status === 408 || status === 425) {
    return new EngineAdapterError(
      'timeout',
      `${provider} returned transient HTTP ${status}`,
      {
        retryable: true,
        suggestion: 'Retry within the shared request budget or use another provider',
      },
    );
  }
  if (status >= 500) {
    return new EngineAdapterError(
      'upstream_5xx',
      `${provider} returned HTTP ${status}`,
      {
        retryable: status !== 501 && retryServerErrors,
        suggestion: 'Use another provider or retry later',
      },
    );
  }
  return new EngineAdapterError(
    'upstream_4xx',
    `${provider} returned HTTP ${status}`,
    {
      retryable: false,
      suggestion: 'Check the request configuration or use another provider',
    },
  );
}

/**
 * Fetch and parse a fixed-host JSON search endpoint without exposing secrets.
 */
export async function fetchSearchJson(
  options: FetchSearchJsonOptions,
): Promise<unknown> {
  try {
    const response = await fetch(options.url, {
      ...options.init,
      signal: withTimeout(
        options.signal,
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ),
    });
    if (!response.ok) {
      throw createHttpError(
        options.provider,
        response,
        options.retryServerErrors ?? true,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new EngineAdapterError(
        'parse_error',
        `${options.provider} returned malformed JSON`,
        {
          retryable: false,
          suggestion: 'Use another provider while the response schema is checked',
          cause: error,
        },
      );
    }
  } catch (error) {
    options.signal?.throwIfAborted();
    if (isEngineAdapterError(error)) throw error;

    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new EngineAdapterError(
        'timeout',
        `${options.provider} request timed out`,
        {
          retryable: true,
          suggestion: 'Retry within the shared request budget or use another provider',
          cause: error,
        },
      );
    }
    throw new EngineAdapterError(
      'unknown',
      `${options.provider} request failed`,
      {
        retryable: true,
        suggestion: 'Check connectivity or use another provider',
        cause: error,
      },
    );
  }
}

export function asJsonObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
