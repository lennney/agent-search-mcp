import { createHash } from 'node:crypto';

import { getProviderFamily } from './evidence-handoff.mjs';
import { canonicalizeSearchResultUrl } from './search-result-contract.mjs';

const SYSTEM_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SHA256 = /^[a-f0-9]{64}$/;

function qualificationError(message) {
  throw new Error(`Invalid runner qualification: ${message}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function observeSearchResponse(response, durationMs) {
  if (!isRecord(response)
    || !Array.isArray(response.results)
    || !Number.isInteger(durationMs)
    || durationMs < 0) {
    qualificationError('search observation requires results and duration');
  }
  const resultIds = [];
  const providerFamilies = new Set();
  for (const result of response.results) {
    if (!isRecord(result) || typeof result.url !== 'string') {
      qualificationError('search result URL is missing');
    }
    resultIds.push(sha256(canonicalizeSearchResultUrl(result.url)));
    for (const source of Array.isArray(result.sources) ? result.sources : []) {
      if (typeof source === 'string' && source.length > 0) {
        providerFamilies.add(getProviderFamily(source));
      }
    }
  }
  const failures = Array.isArray(response.partialFailures)
    ? response.partialFailures.map(failure => ({
        engine: typeof failure?.engine === 'string' ? failure.engine : 'unknown',
        type: typeof failure?.type === 'string' ? failure.type : 'unknown',
      }))
    : [];
  return {
    status: resultIds.length > 0 ? 'non-empty' : 'empty',
    duration_ms: durationMs,
    result_count: resultIds.length,
    result_ids: resultIds,
    provider_families: [...providerFamilies].sort(),
    searched_engines: Array.isArray(response.meta?.execution?.searched_engines)
      ? [...response.meta.execution.searched_engines]
      : [],
    partial_failures: failures,
  };
}

export function observeSearchFailure(error, durationMs) {
  if (!Number.isInteger(durationMs) || durationMs < 0) {
    qualificationError('failed observation duration is invalid');
  }
  return {
    status: 'failed',
    duration_ms: durationMs,
    result_count: 0,
    result_ids: [],
    provider_families: [],
    searched_engines: [],
    partial_failures: [],
    error_type: error instanceof Error ? error.name : 'UnknownError',
  };
}

export function terminalQualificationFailure(observation) {
  if (!isRecord(observation) || !Array.isArray(observation.partial_failures)) {
    return null;
  }
  const failure = observation.partial_failures.find(item => (
    item?.type === 'bot_challenge'
    || item?.type === 'rate_limited'
    || item?.type === 'rate_limit'
  ));
  if (!failure) return null;
  return failure.type === 'bot_challenge' ? 'bot_challenge' : 'rate_limited';
}

export function evaluateRunnerQualification(input, options = {}) {
  if (!isRecord(input)
    || !SHA256.test(input.query_set_sha256)
    || !Array.isArray(input.systems)
    || input.systems.length < 2
    || !Array.isArray(input.samples)
    || input.samples.length === 0) {
    qualificationError('input must contain a query-set hash, systems, and samples');
  }
  const minimumQueries = options.minimumQueries ?? 10;
  const minimumProviderFamilies = options.minimumProviderFamilies ?? 2;
  if (!Number.isInteger(minimumQueries) || minimumQueries < 1
    || !Number.isInteger(minimumProviderFamilies) || minimumProviderFamilies < 2) {
    qualificationError('minimums must be positive integers with at least two families');
  }

  const systemIds = input.systems.map(system => system?.system_id);
  if (systemIds.some(systemId => typeof systemId !== 'string' || !SYSTEM_ID.test(systemId))
    || new Set(systemIds).size !== systemIds.length
    || input.systems.some(system =>
      !Array.isArray(system?.engines)
      || system.engines.length === 0
      || system.engines.some(engine => typeof engine !== 'string'))) {
    qualificationError('systems must have unique stable IDs and engine lists');
  }

  const sampleIds = new Set();
  const systemSummary = new Map(systemIds.map(systemId => [systemId, {
    non_empty_queries: 0,
    empty_queries: 0,
    failed_queries: 0,
  }]));
  let qualifiedQueries = 0;
  const samples = input.samples.map(sample => {
    if (typeof sample?.id !== 'string'
      || sample.id.length === 0
      || sampleIds.has(sample.id)
      || !Array.isArray(sample.systems)
      || sample.systems.length !== systemIds.length) {
      qualificationError('sample IDs and system coverage must be exact');
    }
    sampleIds.add(sample.id);
    const observations = new Map(
      sample.systems.map(system => [system?.system_id, system]),
    );
    if (observations.size !== systemIds.length
      || systemIds.some(systemId => !observations.has(systemId))) {
      qualificationError(`sample ${sample.id} system coverage differs`);
    }

    const providerFamilies = new Set();
    const unionCandidateIds = new Set();
    const nonEmptySystems = [];
    const rankingShapes = new Set();
    const systemRows = systemIds.map(systemId => {
      const observation = observations.get(systemId);
      validateObservation(observation, sample.id, systemId);
      const summary = systemSummary.get(systemId);
      if (observation.status === 'non-empty') {
        summary.non_empty_queries += 1;
        nonEmptySystems.push(systemId);
        rankingShapes.add(JSON.stringify(observation.result_ids));
      } else if (observation.status === 'empty') {
        summary.empty_queries += 1;
      } else {
        summary.failed_queries += 1;
      }
      observation.provider_families.forEach(family => providerFamilies.add(family));
      observation.result_ids.forEach(resultId => unionCandidateIds.add(resultId));
      return summarizeObservation(observation);
    });

    const reasons = [];
    if (nonEmptySystems.length < 2) reasons.push('two_non_empty_systems');
    if (providerFamilies.size < minimumProviderFamilies) {
      reasons.push('provider_family_diversity');
    }
    if (rankingShapes.size < 2) reasons.push('ranking_or_candidate_diversity');
    const qualified = reasons.length === 0;
    if (qualified) qualifiedQueries += 1;
    return {
      id: sample.id,
      systems: systemRows,
      pool_probe: {
        qualified,
        reasons,
        non_empty_systems: nonEmptySystems,
        provider_families: [...providerFamilies].sort(),
        union_candidate_count: unionCandidateIds.size,
        distinct_rankings: rankingShapes.size,
      },
    };
  });

  const readinessReasons = [];
  if (input.samples.length < minimumQueries) readinessReasons.push('minimum_queries_observed');
  if (qualifiedQueries < minimumQueries) readinessReasons.push('minimum_qualified_queries');
  return {
    schema_version: 1,
    kind: 'search-runner-qualification',
    query_set_sha256: input.query_set_sha256,
    systems: input.systems,
    readiness: {
      status: readinessReasons.length === 0 ? 'ready' : 'insufficient-runner',
      minimum_queries: minimumQueries,
      minimum_provider_families: minimumProviderFamilies,
      observed_queries: input.samples.length,
      qualified_queries: qualifiedQueries,
      reasons: readinessReasons,
    },
    system_summary: Object.fromEntries(systemSummary),
    samples,
  };
}

export function runnerQualificationExitCode(report) {
  const status = report?.readiness?.status;
  if (status === 'ready') return 0;
  if (status === 'insufficient-runner') return 2;
  qualificationError('report readiness status is invalid');
}

export function qualificationQueryDelayMs(rawValue) {
  if (rawValue === undefined) return 10_000;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
    qualificationError('query delay must be an integer from 1000 to 60000 ms');
  }
  return value;
}

function summarizeObservation(observation) {
  const {
    result_ids: resultIds,
    ...metadata
  } = observation;
  return {
    ...metadata,
    candidate_set_sha256: sha256(JSON.stringify([...resultIds].sort())),
    ranking_sha256: sha256(JSON.stringify(resultIds)),
  };
}

function validateObservation(observation, sampleId, systemId) {
  if (!isRecord(observation)
    || observation.system_id !== systemId
    || !['non-empty', 'empty', 'failed'].includes(observation.status)
    || !Number.isInteger(observation.duration_ms)
    || observation.duration_ms < 0
    || !Number.isInteger(observation.result_count)
    || observation.result_count < 0
    || !Array.isArray(observation.result_ids)
    || observation.result_ids.length !== observation.result_count
    || observation.result_ids.some(resultId => !SHA256.test(resultId))
    || !Array.isArray(observation.provider_families)
    || observation.provider_families.some(family =>
      typeof family !== 'string' || family.length === 0)
    || !Array.isArray(observation.searched_engines)
    || !Array.isArray(observation.partial_failures)) {
    qualificationError(`${sampleId}/${systemId} observation is invalid`);
  }
}
