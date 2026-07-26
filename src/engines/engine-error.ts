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
