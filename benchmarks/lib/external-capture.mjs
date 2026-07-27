import { createHash } from 'node:crypto';

import { buildCaptureTrace } from './quality-metrics.mjs';
import { canonicalizeSearchResultUrl } from './search-result-contract.mjs';

const SYSTEM_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAX_INPUT_CHARACTERS = 5_000_000;
const MAX_RESULTS = 50;
const FAILURE_TYPES = new Set([
  'timeout',
  'rate_limited',
  'permission_denied',
  'upstream_error',
  'unavailable',
  'unknown',
]);
const FIELD_LIMITS = {
  title: 1_000,
  url: 4_096,
  snippet: 10_000,
};

function captureError(message) {
  throw new Error(`Invalid external capture: ${message}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function queryMetadata(item, index) {
  const normalized = typeof item === 'string' ? { query: item } : item;
  const query = normalized?.query ?? normalized?.q;
  if (typeof query !== 'string' || query.length === 0) {
    captureError(`query set item ${index + 1} has no query/q string`);
  }
  return {
    id: normalized.id ?? `q${index + 1}`,
    query,
    language: normalized.language ?? normalized.lang ?? 'unknown',
    category: normalized.category ?? normalized.type ?? 'unknown',
    freshness: normalized.freshness
      ?? (normalized.type === 'news' ? 'dynamic' : 'evergreen'),
    ...(typeof normalized.question === 'string' && {
      question: normalized.question,
    }),
    ...(typeof normalized.reference_answer === 'string' && {
      reference_answer: normalized.reference_answer,
    }),
  };
}

function validateResult(result, sampleId, index, systemId) {
  if (!isRecord(result)) {
    captureError(`${sampleId} result ${index + 1} must be an object`);
  }
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (field === 'snippet' && result[field] === undefined) continue;
    if (typeof result[field] !== 'string'
      || result[field].length === 0
      || result[field].length > limit) {
      captureError(`${sampleId} result ${index + 1} ${field} is invalid`);
    }
  }
  try {
    canonicalizeSearchResultUrl(result.url);
  } catch (error) {
    captureError(
      `${sampleId} result ${index + 1} URL is invalid: `
      + `${error instanceof Error ? error.message : error}`,
    );
  }
  return {
    title: result.title,
    url: result.url,
    ...(result.snippet !== undefined && { snippet: result.snippet }),
    sources: [systemId],
  };
}

export function normalizeExternalCapture(input, querySet) {
  let serializedInput;
  try {
    serializedInput = JSON.stringify(input);
  } catch {
    captureError('input must be JSON-serializable');
  }
  if (!isRecord(input)
    || serializedInput.length > MAX_INPUT_CHARACTERS
    || input.schema_version !== 1
    || input.kind !== 'external-search-results'
    || !isRecord(input.system)
    || typeof input.system.id !== 'string'
    || !SYSTEM_ID.test(input.system.id)
    || typeof input.system.version !== 'string'
    || input.system.version.length === 0
    || input.system.version.length > 200
    || !Number.isFinite(Date.parse(input.captured_at))
    || !isRecord(input.content_licenses)
    || !isRecord(input.content_licenses[input.system.id])
    || typeof input.content_licenses[input.system.id].license !== 'string'
    || input.content_licenses[input.system.id].license.length === 0
    || input.content_licenses[input.system.id].license.length > 1_000
    || !Array.isArray(input.samples)
    || !Array.isArray(querySet)
    || querySet.length === 0) {
    captureError('header, license disclosure, query set, or samples are invalid');
  }

  const metadata = querySet.map(queryMetadata);
  if (input.samples.length !== metadata.length) {
    captureError('sample coverage must exactly match the query set');
  }
  const systemId = input.system.id;
  const samples = metadata.map((query, index) => {
    const source = input.samples[index];
    if (!isRecord(source) || source.id !== query.id
      || !Number.isInteger(source.duration_ms) || source.duration_ms < 0
      || (source.failure_type !== undefined
        && !FAILURE_TYPES.has(source.failure_type))
      || (source.results !== undefined && !Array.isArray(source.results))
      || (source.failure_type === undefined && source.results === undefined)
      || (source.failure_type !== undefined && source.results !== undefined)) {
      captureError(
        `${query.id} must contain duration and exactly one of results/failure_type`,
      );
    }
    if (source.failure_type !== undefined) {
      return {
        ...query,
        duration_ms: source.duration_ms,
        error: `external:${source.failure_type}`,
      };
    }
    if (source.results.length > MAX_RESULTS) {
      captureError(`${query.id} exceeds the ${MAX_RESULTS}-result limit`);
    }
    const results = source.results.map((result, resultIndex) =>
      validateResult(result, query.id, resultIndex, systemId));
    const response = {
      query: query.query,
      engines: [systemId],
      results,
      meta: {
        total: results.length,
        engines: [systemId],
        execution: {
          searched_engines: [systemId],
          engine_calls: 1,
        },
      },
      partialFailures: [],
    };
    return {
      ...query,
      duration_ms: source.duration_ms,
      response,
      trace: buildCaptureTrace(response, {
        durationMs: source.duration_ms,
        requestedEngines: [systemId],
        startedAt: input.captured_at,
      }),
    };
  });

  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: input.captured_at,
    package_version: input.system.version,
    query_set_sha256: sha256(querySet),
    requested_engines: [systemId],
    content_licenses: input.content_licenses,
    capture_origin: {
      kind: 'external-import',
      schema_version: 1,
      source_sha256: createHash('sha256').update(serializedInput).digest('hex'),
      system_id: systemId,
    },
    samples,
  };
}
