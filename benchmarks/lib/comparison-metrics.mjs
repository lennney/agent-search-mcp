import { createHash } from 'node:crypto';

import { validateCompletedAdjudication } from './pooling.mjs';

const CUTOFF = 5;
const MINIMUM_OVERALL_QUERIES = 30;
const MINIMUM_SLICE_QUERIES = 10;

function comparisonError(message) {
  throw new Error(`Invalid pooled comparison: ${message}`);
}

function normalizeQueryKey(value) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentileNearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function dcg(grades) {
  return grades.reduce(
    (sum, grade, index) => sum + grade / Math.log2(index + 2),
    0,
  );
}

function summarizeRows(rows) {
  const metricAverage = key => round(average(rows.map(row => row[key])) * 100);
  const supported = rows.reduce((sum, row) => sum + row.supportedRelevant, 0);
  const relevant = rows.reduce((sum, row) => sum + row.returnedRelevant, 0);
  const failed = rows.filter(row => row.failed).length;
  const expectedFailures = rows.reduce((sum, row) => sum + row.expectedFailures, 0);
  const disclosedFailures = rows.reduce((sum, row) => sum + row.disclosedFailures, 0);
  const latencies = rows
    .map(row => row.durationMs)
    .filter(value => Number.isFinite(value));
  return {
    evaluated_queries: rows.length,
    queries_with_relevant_pool: rows.filter(row => row.poolRelevant > 0).length,
    retrieval: {
      ndcg_at_5_percent: metricAverage('ndcg'),
      precision_at_5_percent: metricAverage('precision'),
      pooled_recall_at_5_percent: metricAverage('recall'),
      reciprocal_rank_at_5_percent: metricAverage('reciprocalRank'),
      success_at_5_percent: metricAverage('success'),
    },
    citation_support: {
      supported_relevant_results: supported,
      relevant_results: relevant,
      rate_percent: relevant === 0 ? null : round(supported / relevant * 100),
    },
    latency: {
      average_ms: average(latencies) === null ? null : round(average(latencies)),
      p50_ms: percentileNearestRank(latencies, 0.5),
      p95_ms: percentileNearestRank(latencies, 0.95),
    },
    failure_transparency: {
      failed_queries: failed,
      expected_failures: expectedFailures,
      disclosed_failures: disclosedFailures,
      undisclosed_failures: expectedFailures - disclosedFailures,
      disclosure_rate_percent: expectedFailures === 0
        ? 100
        : round(disclosedFailures / expectedFailures * 100),
    },
  };
}

function buildSlices(rows) {
  const keys = ['language', 'category', 'freshness'];
  return Object.fromEntries(keys.map(key => {
    const groups = new Map();
    for (const row of rows) {
      const value = row[key] ?? 'unknown';
      const group = groups.get(value) ?? [];
      group.push(row);
      groups.set(value, group);
    }
    return [key, Object.fromEntries(
      [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([value, group]) => {
          const distinctQueries = new Set(group.map(row => row.queryKey)).size;
          const eligible = group.length >= MINIMUM_SLICE_QUERIES
            && distinctQueries >= MINIMUM_SLICE_QUERIES;
          return [value, {
            ...summarizeRows(group),
            claim_readiness: {
              status: eligible ? 'eligible' : 'insufficient-sample',
              actual_queries: group.length,
              distinct_queries: distinctQueries,
              required_queries: MINIMUM_SLICE_QUERIES,
            },
          }];
        }),
    )];
  }));
}

export function evaluatePooledComparison(pool, adjudication) {
  if (!isRecord(pool)
    || pool.kind !== 'pooled-search-capture'
    || !Array.isArray(pool.source_captures)
    || pool.source_captures.length < 2
    || !Array.isArray(pool.samples)
    || pool.samples.length === 0) {
    comparisonError('source must be a non-empty multi-system pool');
  }
  validateCompletedAdjudication(adjudication);
  const poolHash = sha256(pool);
  if (adjudication.source_pool_sha256 !== poolHash) {
    comparisonError('adjudication references a different source pool');
  }

  const systemIds = pool.source_captures.map(source => source?.system_id);
  if (systemIds.some(id => typeof id !== 'string' || id.length === 0)
    || new Set(systemIds).size !== systemIds.length) {
    comparisonError('source systems must have unique IDs');
  }

  const adjudicationSamples = new Map(
    adjudication.samples.map(sample => [sample?.id, sample]),
  );
  if (adjudicationSamples.size !== adjudication.samples.length
    || adjudicationSamples.size !== pool.samples.length) {
    comparisonError('adjudication sample set does not match the pool');
  }

  const rowsBySystem = new Map(systemIds.map(systemId => [systemId, []]));
  for (const poolSample of pool.samples) {
    const adjudicated = adjudicationSamples.get(poolSample?.id);
    if (!adjudicated
      || typeof poolSample?.query !== 'string'
      || poolSample.query.trim().length === 0
      || !Array.isArray(poolSample?.candidates)) {
      comparisonError(`adjudication sample set does not match the pool at ${poolSample?.id}`);
    }
    const pooledCandidates = new Map(
      poolSample.candidates.map(candidate => [candidate?.candidate_id, candidate]),
    );
    const adjudicatedCandidates = new Map(
      adjudicated.candidates.map(candidate => [candidate?.candidate_id, candidate]),
    );
    if (pooledCandidates.size !== poolSample.candidates.length
      || adjudicatedCandidates.size !== pooledCandidates.size
      || [...pooledCandidates.keys()].some(id => !adjudicatedCandidates.has(id))) {
      comparisonError(`adjudication candidate set does not match the pool at ${poolSample.id}`);
    }

    const qrels = new Map();
    for (const [candidateId, candidate] of pooledCandidates) {
      const judged = adjudicatedCandidates.get(candidateId);
      if (judged.url !== candidate.url) {
        comparisonError(`adjudication candidate set does not match the pool at ${poolSample.id}`);
      }
      qrels.set(candidateId, judged.final);
    }
    const poolGrades = [...qrels.values()].map(label => label.relevance);
    const poolRelevant = poolGrades.filter(grade => grade >= 2).length;
    const idealDcg = dcg(
      [...poolGrades].sort((left, right) => right - left).slice(0, CUTOFF),
    );

    if (!Array.isArray(poolSample.system_runs)) {
      comparisonError(`pool sample ${poolSample.id} has no system runs`);
    }
    for (const systemId of systemIds) {
      const matchingRuns = poolSample.system_runs.filter(run => run?.system_id === systemId);
      if (matchingRuns.length !== 1 || !Array.isArray(matchingRuns[0].result_order)) {
        comparisonError(`pool sample ${poolSample.id} must have one run for ${systemId}`);
      }
      const run = matchingRuns[0];
      if (!['success', 'failed'].includes(run.status)
        || !Number.isFinite(run.duration_ms)
        || run.duration_ms < 0
        || !Array.isArray(run.engine_outcomes)
        || !Array.isArray(run.partial_failures)
        || new Set(run.result_order).size !== run.result_order.length
        || run.result_order.some(candidateId => !qrels.has(candidateId))) {
        comparisonError(`pool sample ${poolSample.id} has an invalid rank list for ${systemId}`);
      }
      const outcomeEngines = run.engine_outcomes.map(outcome => outcome?.engine);
      if (run.engine_outcomes.some(outcome =>
        !isRecord(outcome)
        || typeof outcome.engine !== 'string'
        || outcome.engine.length === 0
        || !['success', 'skipped', 'failed'].includes(outcome.status))
        || new Set(outcomeEngines).size !== outcomeEngines.length
        || run.partial_failures.some(failure =>
          !isRecord(failure)
          || typeof failure.engine !== 'string'
          || failure.engine.length === 0)) {
        comparisonError(`pool sample ${poolSample.id} has invalid failure evidence for ${systemId}`);
      }
      for (const [index, candidateId] of run.result_order.entries()) {
        const systemRank = pooledCandidates.get(candidateId)?.systems
          ?.find(system => system.system_id === systemId)?.rank;
        if (systemRank !== index + 1) {
          comparisonError(`pool sample ${poolSample.id} rank provenance drifted for ${systemId}`);
        }
      }

      const topLabels = run.result_order
        .slice(0, CUTOFF)
        .map(candidateId => qrels.get(candidateId));
      const returnedRelevant = topLabels.filter(label => label.relevance >= 2).length;
      const supportedRelevant = topLabels.filter(label =>
        label.relevance >= 2 && label.citation_supported).length;
      const firstRelevant = topLabels.findIndex(label => label.relevance >= 2);
      const failedEngines = run.engine_outcomes
        .filter(outcome => outcome?.status === 'failed' && typeof outcome.engine === 'string')
        .map(outcome => outcome.engine);
      const disclosedEngines = new Set(
        run.partial_failures
          .filter(failure => typeof failure?.engine === 'string')
          .map(failure => failure.engine),
      );
      const runFailureCount = run.status === 'failed' ? 1 : 0;
      const runFailureDisclosed = run.status === 'failed'
        && typeof run.error === 'string'
        && run.error.length > 0
        ? 1
        : 0;
      rowsBySystem.get(systemId).push({
        queryKey: normalizeQueryKey(poolSample.query),
        language: poolSample.language,
        category: poolSample.category,
        freshness: poolSample.freshness,
        poolRelevant,
        returnedRelevant,
        supportedRelevant,
        ndcg: idealDcg === 0
          ? 0
          : dcg(topLabels.map(label => label.relevance)) / idealDcg,
        precision: returnedRelevant / CUTOFF,
        recall: poolRelevant === 0 ? 0 : returnedRelevant / poolRelevant,
        reciprocalRank: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
        success: firstRelevant < 0 ? 0 : 1,
        durationMs: run.duration_ms,
        failed: run.status === 'failed',
        expectedFailures: failedEngines.length + runFailureCount,
        disclosedFailures: failedEngines.filter(engine => disclosedEngines.has(engine)).length
          + runFailureDisclosed,
      });
    }
    adjudicationSamples.delete(poolSample.id);
  }
  if (adjudicationSamples.size > 0) {
    comparisonError('adjudication sample set does not match the pool');
  }
  const distinctQueries = new Set(
    pool.samples.map(sample => normalizeQueryKey(sample.query)),
  ).size;
  const claimChecks = {
    human_verified: { passed: true },
    multi_system: {
      passed: systemIds.length >= 2,
      actual: systemIds.length,
      required: 2,
    },
    adjudicated_queries: {
      passed: pool.samples.length >= MINIMUM_OVERALL_QUERIES,
      actual: pool.samples.length,
      required: MINIMUM_OVERALL_QUERIES,
    },
    distinct_queries: {
      passed: distinctQueries >= MINIMUM_OVERALL_QUERIES,
      actual: distinctQueries,
      required: MINIMUM_OVERALL_QUERIES,
    },
  };
  const qualityClaimEligible = Object.values(claimChecks)
    .every(check => check.passed);

  return {
    schema_version: 1,
    kind: 'pooled-search-comparison',
    label_status: 'human-verified',
    quality_claim_eligible: qualityClaimEligible,
    claim_readiness: {
      status: qualityClaimEligible ? 'eligible' : 'insufficient-sample',
      policy: {
        minimum_overall_queries: MINIMUM_OVERALL_QUERIES,
        minimum_slice_queries: MINIMUM_SLICE_QUERIES,
      },
      checks: claimChecks,
    },
    source_pool_sha256: poolHash,
    source_adjudication_sha256: sha256(adjudication),
    source_captures: pool.source_captures,
    reviewers: adjudication.reviewers,
    adjudicator: adjudication.adjudicator,
    reviewer_agreement: adjudication.reviewer_agreement,
    metric_scope: {
      cutoff: CUTOFF,
      relevance_threshold: 2,
      recall: 'adjudicated-candidate-pool',
      queries_without_relevant_pool: 'scored-as-zero',
    },
    systems: Object.fromEntries(systemIds.map(systemId => {
      const rows = rowsBySystem.get(systemId);
      return [systemId, {
        ...summarizeRows(rows),
        slices: buildSlices(rows),
      }];
    })),
    unmeasured: {
      answer_accuracy: 'No synthesized answer was independently judged per system.',
      tokens_per_correct_answer: 'Answer correctness is unavailable; this metric is not inferred.',
    },
  };
}
