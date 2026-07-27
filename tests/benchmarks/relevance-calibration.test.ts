import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { prepareBlindedReviewPacket } from '../../benchmarks/lib/quality-metrics.mjs';
import {
  poolLiveCaptures,
  prepareReviewAdjudication,
} from '../../benchmarks/lib/pooling.mjs';
import { calibrateRelevanceGate } from '../../benchmarks/lib/relevance-calibration.mjs';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function capture(system: string, relevance: number[]) {
  const urls = ['high', 'medium', 'weak', 'noise'];
  const results = urls.map((slug, index) => ({
    title: `${slug} result`,
    url: `https://example.com/${slug}`,
    snippet: `${slug} evidence`,
    confidence: 0.8,
    relevance: relevance[index],
    source_count: 1,
    sources: [system],
  }));
  const response = {
    query: 'alpha query',
    engines: [system],
    results,
    meta: {
      total: results.length,
      high_confidence: results.length,
      engines: [system],
    },
    security_note: 'fixture',
  };
  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: '2026-07-26T00:00:00.000Z',
    package_version: '3.1.0',
    query_set_sha256: 'a'.repeat(64),
    query_set: 'benchmarks/queries/routing-calibration.json',
    requested_engines: [system],
    content_licenses: {},
    tokenizer: 'test-tokenizer',
    samples: [{
      id: 'q1',
      query: 'alpha query',
      language: 'en',
      category: 'factual',
      freshness: 'evergreen',
      question: 'What is alpha?',
      reference_answer: 'Alpha is the first letter.',
      duration_ms: 100,
      response,
      trace: {
        started_at: '2026-07-26T00:00:00.000Z',
        duration_ms: 100,
        raw_response_sha256: sha256(response),
        engine_outcomes: [{ engine: system, status: 'success' }],
      },
    }],
  };
}

function completedAdjudication(pool: Record<string, any>) {
  const relevanceByUrl = new Map([
    ['https://example.com/high', 3],
    ['https://example.com/medium', 2],
    ['https://example.com/weak', 1],
    ['https://example.com/noise', 0],
  ]);
  const packets = ['reviewer-a', 'reviewer-b'].map(reviewerSlot => {
    const packet = prepareBlindedReviewPacket(pool, { reviewerSlot });
    for (const sample of packet.samples) {
      for (const candidate of sample.candidates) {
        candidate.relevance = relevanceByUrl.get(candidate.url);
        candidate.citation_supported = candidate.relevance >= 2;
      }
    }
    packet.reviewer = {
      id: `human-${reviewerSlot}`,
      kind: 'human',
      completed_at: '2026-07-26T01:00:00.000Z',
    };
    return packet;
  });
  const adjudication = prepareReviewAdjudication(pool, packets);
  adjudication.status = 'completed';
  adjudication.adjudicator = {
    id: 'human-adjudicator',
    kind: 'human',
    completed_at: '2026-07-26T02:00:00.000Z',
  };
  return adjudication;
}

describe('routing relevance calibration', () => {
  function fixture() {
    const pool = poolLiveCaptures([
      { systemId: 'agent-search', capture: capture('agent-search', [0.8, 0.55, 0.4, 0.2]) },
      { systemId: 'comparison', capture: capture('comparison', [0.7, 0.5, 0.3, 0.1]) },
    ]);
    return { pool, adjudication: completedAdjudication(pool) };
  }

  it('selects a conservative threshold from completed labels', () => {
    const { pool, adjudication } = fixture();
    const report = calibrateRelevanceGate(pool, adjudication, 'agent-search', {
      minimumQueries: 1,
      minimumJudgments: 4,
      targetPrecision: 0.8,
    });

    expect(report.readiness).toEqual({
      status: 'ready',
      minimum_queries: 1,
      minimum_judgments: 4,
      unmet: [],
    });
    expect(report.dataset).toEqual({
      queries: 1,
      judgments: 4,
      positive_labels: 2,
      negative_labels: 2,
    });
    expect(report.current_threshold).toEqual(expect.objectContaining({
      threshold: 0.35,
      true_positive: 2,
      false_positive: 1,
      precision: 0.6667,
      recall: 1,
    }));
    expect(report.recommended_threshold).toBe(0.55);
    expect(report.provisional_best_threshold).toEqual(expect.objectContaining({
      threshold: 0.55,
      precision: 1,
      recall: 1,
      f1: 1,
    }));
  });

  it('does not turn a small diagnostic run into a formal recommendation', () => {
    const { pool, adjudication } = fixture();
    const report = calibrateRelevanceGate(pool, adjudication, 'agent-search');

    expect(report.readiness.status).toBe('insufficient-sample');
    expect(report.readiness.unmet).toEqual([
      'minimum_queries',
      'minimum_judgments',
    ]);
    expect(report.recommended_threshold).toBeNull();
    expect(report.provisional_best_threshold.threshold).toBe(0.55);
  });

  it('rejects a completed adjudication for a different pool', () => {
    const { pool, adjudication } = fixture();
    const drifted = structuredClone(pool);
    drifted.samples[0].candidates[0].title = 'tampered title';

    expect(() => calibrateRelevanceGate(drifted, adjudication, 'agent-search', {
      minimumQueries: 1,
      minimumJudgments: 4,
    })).toThrow(/different source pool/);
  });

  it('rejects selected-system candidates without protected routing signals', () => {
    const { pool, adjudication } = fixture();
    const withoutSignals = structuredClone(pool);
    for (const candidate of withoutSignals.samples[0].candidates) {
      const system = candidate.systems.find((item: Record<string, any>) =>
        item.system_id === 'agent-search');
      delete system.routing_signals;
    }
    const relinked = structuredClone(adjudication);
    relinked.source_pool_sha256 = sha256(withoutSignals);

    expect(() => calibrateRelevanceGate(
      withoutSignals,
      relinked,
      'agent-search',
      { minimumQueries: 1, minimumJudgments: 4 },
    )).toThrow(/no protected routing signals/);
  });
});
