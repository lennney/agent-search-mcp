import type { EngineError } from '../types.js';

export type EngineFailureType = EngineError['type'];

const ENGINE_FAILURE_TYPES = new Set<EngineFailureType>([
  'validation_error',
  'parse_error',
  'timeout',
  'upstream_4xx',
  'upstream_5xx',
  'rate_limited',
  'bot_challenge',
  'permission_denied',
  'unknown',
]);

interface EngineAdapterErrorOptions {
  retryable?: boolean;
  cooldownMs?: number;
  suggestion: string;
  cause?: unknown;
}

/**
 * Stable error contract between adapters and the search orchestrator.
 *
 * Adapters describe the upstream failure once; orchestration decides how to
 * expose it and whether the provider should be suspended.
 */
export class EngineAdapterError extends Error {
  readonly failureType: EngineFailureType;
  readonly retryable: boolean;
  readonly cooldownMs?: number;
  readonly suggestion: string;

  constructor(
    failureType: EngineFailureType,
    message: string,
    options: EngineAdapterErrorOptions,
  ) {
    super(message, { cause: options.cause });
    this.name = 'EngineAdapterError';
    this.failureType = failureType;
    this.retryable = options.retryable ?? false;
    this.cooldownMs = options.cooldownMs;
    this.suggestion = options.suggestion;
  }
}

export function isEngineAdapterError(
  error: unknown,
): error is EngineAdapterError {
  if (!(error instanceof Error)) return false;
  const candidate = error as Partial<EngineAdapterError>;
  return typeof candidate.failureType === 'string'
    && ENGINE_FAILURE_TYPES.has(candidate.failureType as EngineFailureType)
    && typeof candidate.retryable === 'boolean'
    && typeof candidate.suggestion === 'string'
    && (candidate.cooldownMs === undefined
      || (Number.isFinite(candidate.cooldownMs) && candidate.cooldownMs > 0));
}

/** Convert adapter and transport errors into the shared agent-facing contract. */
export function classifyEngineError(engine: string, error: Error): EngineError {
  if (isEngineAdapterError(error)) {
    return {
      engine,
      type: error.failureType,
      message: error.message,
      suggestion: error.suggestion,
    };
  }

  const message = error.message.toLowerCase();
  if (message.includes('malformed') || message.includes('parse error') || message.includes('parser')) {
    return { engine, type: 'parse_error', message: error.message, suggestion: 'Use another engine while the response parser is checked' };
  }
  if (message.includes('timeout') || message.includes('abort') || message.includes('etimedout')) {
    return { engine, type: 'timeout', message: error.message, suggestion: 'Retry with a shorter query or try again later' };
  }
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('forbidden')) {
    return { engine, type: 'permission_denied', message: error.message, suggestion: 'Check API key configuration' };
  }
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return { engine, type: 'rate_limited', message: error.message, suggestion: 'Retry in 30s or reduce request rate' };
  }
  if (message.includes('http 4') || message.includes('400') || message.includes('404')) {
    return { engine, type: 'upstream_4xx', message: error.message, suggestion: 'Check query syntax or try a different engine' };
  }
  if (message.includes('http 5') || message.includes('500') || message.includes('502') || message.includes('503')) {
    return { engine, type: 'upstream_5xx', message: error.message, suggestion: 'Engine may be temporarily unavailable, retry later' };
  }
  if (message.includes('econnrefused') || message.includes('econnreset') || message.includes('enotfound') || message.includes('network')) {
    return { engine, type: 'unknown', message: error.message, suggestion: 'Network error — check connectivity or try a different engine' };
  }
  return { engine, type: 'unknown', message: error.message, suggestion: 'Try a different engine or check the query' };
}
