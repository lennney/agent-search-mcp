import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { evaluatePooledComparison } from '../../benchmarks/lib/comparison-metrics.mjs';
import { prepareBlindedReviewPacket } from '../../benchmarks/lib/quality-metrics.mjs';
import {
  poolLiveCaptures,
  prepareReviewAdjudication,
} from '../../benchmarks/lib/pooling.mjs';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function capture(
  results: Array<{ title: string; url: string; snippet: string }>,
  durationMs: number,
  failedEngine?: string,
) {
  const response = {
    query: 'alpha query',
    results,
    partialFailures: failedEngine
      ? [{ engine: failedEngine, error: 'timeout' }]
      : [],
  };
  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: '2026-07-26T00:00:00.000Z',
    package_version: '1.0.0',
    requested_engines: ['fixture'],
    content_licenses: {},
    samples: [{
      id: 'q1',
      query: 'alpha query',
      language: 'en',
      category: 'factual',
      freshness: 'evergreen',
      question: 'What is alpha?',
      reference_answer: 'Alpha is the first letter.',
      duration_ms: durationMs,
      response,
      trace: {
        started_at: '2026-07-26T00:00:00.000Z',
        duration_ms: durationMs,
        raw_response_sha256: sha256(response),
        engine_outcomes: [
          { engine: 'fixture', status: 'success' },
          ...(failedEngine ? [{ engine: failedEngine, status: 'failed' }] : []),
        ],
      },
    }],
  };
}

function completePacket(packet: Record<string, any>, labels: Map<string, number>) {
  const completed = structuredClone(packet);
  completed.reviewer = {
    id: `human-${completed.reviewer_slot}`,
    kind: 'human',
    completed_at: '2026-07-26T01:00:00.000Z',
  };
  for (const sample of completed.samples) {
    for (const candidate of sample.candidates) {
      candidate.relevance = labels.get(candidate.url) ?? 0;
      candidate.citation_supported = candidate.relevance >= 2;
    }
  }
  return completed;
}

function completedEvidence() {
  const systemA = capture([
    {
      title: 'Shared',
      url: 'https://example.com/shared?utm_source=a',
      snippet: 'Alpha evidence.',
    },
    {
      title: 'Noise',
      url: 'https://example.com/noise',
      snippet: 'Unrelated.',
    },
  ], 100, 'secondary');
  const systemB = capture([
    {
      title: 'Shared',
      url: 'https://example.com/shared',
      snippet: 'Alpha evidence.',
    },
    {
      title: 'Second relevant',
      url: 'https://example.com/second',
      snippet: 'More alpha evidence.',
    },
  ], 200);
  const pool = poolLiveCaptures([
    { systemId: 'system-a', capture: systemA },
    { systemId: 'system-b', capture: systemB },
  ]);
  const labels = new Map([
    ['https://example.com/shared', 3],
    ['https://example.com/shared?utm_source=a', 3],
    ['https://example.com/second', 2],
    ['https://example.com/noise', 0],
  ]);
  const reviews = ['reviewer-a', 'reviewer-b'].map(slot =>
    completePacket(prepareBlindedReviewPacket(pool, { reviewerSlot: slot }), labels));
  const adjudication = prepareReviewAdjudication(pool, reviews);
  adjudication.status = 'completed';
  adjudication.adjudicator = {
    id: 'human-adjudicator',
    kind: 'human',
    completed_at: '2026-07-26T02:00:00.000Z',
  };
  for (const sample of adjudication.samples) {
    for (const candidate of sample.candidates) {
      candidate.final = {
        relevance: candidate.judgments[0].relevance,
        citation_supported: candidate.judgments[0].citation_supported,
      };
    }
  }
  return { pool, adjudication };
}

describe('pooled search comparison metrics', () => {
  it('reconstructs each system ranking against shared adjudicated qrels', () => {
    const { pool, adjudication } = completedEvidence();

    const report = evaluatePooledComparison(pool, adjudication);

    expect(report).toEqual(expect.objectContaining({
      schema_version: 1,
      kind: 'pooled-search-comparison',
      label_status: 'human-verified',
      quality_claim_eligible: false,
      claim_readiness: {
        status: 'insufficient-sample',
        policy: {
          minimum_overall_queries: 30,
          minimum_slice_queries: 10,
        },
        checks: {
          human_verified: { passed: true },
          multi_system: { passed: true, actual: 2, required: 2 },
          adjudicated_queries: { passed: false, actual: 1, required: 30 },
          distinct_queries: { passed: false, actual: 1, required: 30 },
          paired_uncertainty: {
            passed: false,
            reported_pairs: 0,
            required_pairs: 1,
          },
        },
      },
      source_pool_sha256: sha256(pool),
      source_adjudication_sha256: sha256(adjudication),
      metric_scope: {
        cutoff: 5,
        relevance_threshold: 2,
        recall: 'adjudicated-candidate-pool',
        queries_without_relevant_pool: 'scored-as-zero',
      },
      reviewer_agreement: {
        reviewer_pairs: 1,
        judged_candidates: 3,
        relevance: {
          raw_agreement_percent: 100,
          mean_pairwise_quadratic_weighted_kappa: 1,
          defined_pairs: 1,
        },
        citation_support: {
          raw_agreement_percent: 100,
          mean_pairwise_cohens_kappa: 1,
          defined_pairs: 1,
        },
      },
    }));
    expect(report.systems['system-a']).toEqual(expect.objectContaining({
      evaluated_queries: 1,
      queries_with_relevant_pool: 1,
      retrieval: {
        ndcg_at_5_percent: 70.4,
        precision_at_5_percent: 20,
        pooled_recall_at_5_percent: 50,
        reciprocal_rank_at_5_percent: 100,
        success_at_5_percent: 100,
      },
      citation_support: {
        supported_relevant_results: 1,
        relevant_results: 1,
        rate_percent: 100,
      },
      latency: {
        average_ms: 100,
        p50_ms: 100,
        p95_ms: 100,
      },
      failure_transparency: {
        failed_queries: 0,
        expected_failures: 1,
        disclosed_failures: 1,
        undisclosed_failures: 0,
        disclosure_rate_percent: 100,
      },
    }));
    expect(report.systems['system-b'].retrieval).toEqual({
      ndcg_at_5_percent: 100,
      precision_at_5_percent: 40,
      pooled_recall_at_5_percent: 100,
      reciprocal_rank_at_5_percent: 100,
      success_at_5_percent: 100,
    });
    expect(report.systems['system-a'].slices.language.en.claim_readiness).toEqual({
      status: 'insufficient-sample',
      actual_queries: 1,
      distinct_queries: 1,
      required_queries: 10,
    });
    expect(report.pairwise_comparisons['system-a__vs__system-b']).toEqual({
      status: 'insufficient-sample',
      left_system: 'system-a',
      right_system: 'system-b',
      paired_queries: 1,
      distinct_queries: 1,
      required_queries: 30,
      metrics: null,
    });
    expect(report.unmeasured).toEqual({
      answer_accuracy: 'No synthesized answer was independently judged per system.',
      tokens_per_correct_answer: 'Answer correctness is unavailable; this metric is not inferred.',
    });
  });

  it('requires the query floor to contain distinct queries', () => {
    const { pool, adjudication } = completedEvidence();
    const sourcePoolSample = pool.samples[0];
    const sourceAdjudicationSample = adjudication.samples[0];
    pool.samples = Array.from({ length: 30 }, (_, index) => ({
      ...structuredClone(sourcePoolSample),
      id: `q${index + 1}`,
      query: index % 2 === 0 ? ' Alpha   Query ' : 'ＡＬＰＨＡ QUERY',
    }));
    adjudication.samples = Array.from({ length: 30 }, (_, index) => ({
      ...structuredClone(sourceAdjudicationSample),
      id: `q${index + 1}`,
      query: pool.samples[index].query,
    }));
    adjudication.reviewer_agreement.judged_candidates = 90;
    adjudication.source_pool_sha256 = sha256(pool);

    const duplicateReport = evaluatePooledComparison(pool, adjudication);

    expect(duplicateReport.quality_claim_eligible).toBe(false);
    expect(duplicateReport.claim_readiness.checks.adjudicated_queries).toEqual({
      passed: true,
      actual: 30,
      required: 30,
    });
    expect(duplicateReport.claim_readiness.checks.distinct_queries).toEqual({
      passed: false,
      actual: 1,
      required: 30,
    });

    pool.samples.forEach((sample: Record<string, any>, index: number) => {
      sample.query = `alpha query ${index + 1}`;
      adjudication.samples[index].query = sample.query;
    });
    adjudication.source_pool_sha256 = sha256(pool);
    const report = evaluatePooledComparison(pool, adjudication);

    expect(report.quality_claim_eligible).toBe(true);
    expect(report.claim_readiness.status).toBe('eligible');
    expect(report.claim_readiness.checks.distinct_queries).toEqual({
      passed: true,
      actual: 30,
      required: 30,
    });
    expect(report.claim_readiness.checks.paired_uncertainty).toEqual({
      passed: true,
      reported_pairs: 1,
      required_pairs: 1,
    });
    expect(report.pairwise_comparisons['system-a__vs__system-b'])
      .toEqual(expect.objectContaining({
        status: 'reported',
        left_system: 'system-a',
        right_system: 'system-b',
        paired_queries: 30,
        distinct_queries: 30,
        method: {
          name: 'paired-bootstrap-percentile',
          iterations: 2000,
          confidence_level: 0.95,
          seed_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        metrics: {
          ndcg_at_5_percentage_points: {
            delta: -29.6,
            ci_95: { lower: -29.6, upper: -29.6 },
            direction: 'higher-is-better',
          },
          precision_at_5_percentage_points: {
            delta: -20,
            ci_95: { lower: -20, upper: -20 },
            direction: 'higher-is-better',
          },
          pooled_recall_at_5_percentage_points: {
            delta: -50,
            ci_95: { lower: -50, upper: -50 },
            direction: 'higher-is-better',
          },
          reciprocal_rank_at_5_percentage_points: {
            delta: 0,
            ci_95: { lower: 0, upper: 0 },
            direction: 'higher-is-better',
          },
          success_at_5_percentage_points: {
            delta: 0,
            ci_95: { lower: 0, upper: 0 },
            direction: 'higher-is-better',
          },
          latency_ms: {
            delta: -100,
            ci_95: { lower: -100, upper: -100 },
            direction: 'lower-is-better',
          },
        },
      }));
    expect(evaluatePooledComparison(pool, adjudication).pairwise_comparisons)
      .toEqual(report.pairwise_comparisons);
    expect(report.systems['system-a'].slices.language.en.claim_readiness.status)
      .toBe('eligible');

    pool.samples.slice(0, 15).forEach((sample: Record<string, any>) => {
      sample.system_runs.find((run: Record<string, any>) =>
        run.system_id === 'system-a').result_order = [];
    });
    adjudication.source_pool_sha256 = sha256(pool);
    const varyingReport = evaluatePooledComparison(pool, adjudication);
    const varyingNdcg = varyingReport
      .pairwise_comparisons['system-a__vs__system-b']
      .metrics.ndcg_at_5_percentage_points;
    expect(varyingNdcg.ci_95.lower).toBeLessThan(varyingNdcg.delta);
    expect(varyingNdcg.ci_95.upper).toBeGreaterThan(varyingNdcg.delta);
  });

  it('rejects pending or mismatched adjudication instead of emitting claims', () => {
    const { pool, adjudication } = completedEvidence();
    const pending = structuredClone(adjudication);
    pending.status = 'pending-adjudication';
    expect(() => evaluatePooledComparison(pool, pending)).toThrow(/completed/);

    const mismatched = structuredClone(adjudication);
    mismatched.source_pool_sha256 = 'f'.repeat(64);
    expect(() => evaluatePooledComparison(pool, mismatched)).toThrow(/source pool/);
  });

  it('rejects adjudication candidate drift', () => {
    const { pool, adjudication } = completedEvidence();
    adjudication.samples[0].candidates[0].candidate_id = 'c-tampered';

    expect(() => evaluatePooledComparison(pool, adjudication))
      .toThrow(/candidate set/);
  });

  it('rejects duplicate adjudication samples instead of silently collapsing them', () => {
    const { pool, adjudication } = completedEvidence();
    adjudication.samples.push(structuredClone(adjudication.samples[0]));

    expect(() => evaluatePooledComparison(pool, adjudication))
      .toThrow(/sample/);
  });
});
