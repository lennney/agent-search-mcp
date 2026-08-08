import { createHash } from 'node:crypto';

export const COMPETITIVE_CAPTURE_CONTRACT_VERSION = 2;
export const COMPETITIVE_RESULT_LIMIT = 5;
export const COMPETITIVE_DELAY_MS = 10_000;
export const TERMINAL_CAPTURE_FAILURES = new Set(['bot_challenge', 'rate_limited']);

export function captureConfigurationSha256(configuration) {
  return createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
}

export function isTerminalCaptureFailure(value) {
  if (typeof value === 'string') {
    return /(?:bot[_ -]?challenge|rate[_ -]?limit(?:ed)?|http\s*429)/iu.test(value);
  }
  if (typeof value !== 'object' || value === null) return false;
  const type = value.type ?? value.failureType ?? value.failure_type;
  return TERMINAL_CAPTURE_FAILURES.has(type)
    || isTerminalCaptureFailure(value.message)
    || isTerminalCaptureFailure(value.error);
}

export function assertCompleteCompetitiveCapture(capture, systemId = 'capture') {
  if (typeof capture !== 'object' || capture === null
    || capture.capture_contract_version !== COMPETITIVE_CAPTURE_CONTRACT_VERSION
    || capture.capture_status !== 'complete'
    || !Number.isInteger(capture.expected_sample_count)
    || capture.expected_sample_count < 1
    || capture.completed_sample_count !== capture.expected_sample_count
    || !Number.isInteger(capture.result_limit)
    || capture.result_limit !== COMPETITIVE_RESULT_LIMIT
    || typeof capture.capture_configuration_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(capture.capture_configuration_sha256)
    || typeof capture.system_version_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(capture.system_version_sha256)
    || !Array.isArray(capture.samples)
    || capture.samples.length !== capture.expected_sample_count) {
    throw new Error(`Invalid competitive capture: ${systemId} is incomplete or uses the legacy contract`);
  }
  return capture;
}
