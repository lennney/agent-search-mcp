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
      quality_claim_eligible: true,
      source_pool_sha256: sha256(pool),
      source_adjudication_sha256: sha256(adjudication),
      metric_scope: {
        cutoff: 5,
        relevance_threshold: 2,
        recall: 'adjudicated-candidate-pool',
        queries_without_relevant_pool: 'scored-as-zero',
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
    expect(report.unmeasured).toEqual({
      answer_accuracy: 'No synthesized answer was independently judged per system.',
      tokens_per_correct_answer: 'Answer correctness is unavailable; this metric is not inferred.',
    });
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
      .toThrow(/sample set/);
  });
});
