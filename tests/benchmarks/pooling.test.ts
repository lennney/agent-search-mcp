import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { prepareBlindedReviewPacket } from '../../benchmarks/lib/quality-metrics.mjs';
import {
  canonicalizePoolUrl,
  poolLiveCaptures,
  prepareReviewAdjudication,
  validateCompletedAdjudication,
} from '../../benchmarks/lib/pooling.mjs';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function result(url: string, title: string, snippet: string) {
  return {
    title,
    url,
    snippet,
    confidence: 0.8,
    relevance: 0.6,
    source_count: 1,
    sources: ['fixture-engine'],
  };
}

function capture(results: ReturnType<typeof result>[], overrides: Record<string, unknown> = {}) {
  const response = {
    query: 'alpha query',
    engines: ['fixture-engine'],
    results,
    meta: {
      total: results.length,
      high_confidence: results.length,
      engines: ['fixture-engine'],
    },
    security_note: 'fixture',
  };
  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: '2026-07-26T00:00:00.000Z',
    package_version: '1.0.0',
    query_set_sha256: 'a'.repeat(64),
    query_set: 'benchmarks/queries/pool.json',
    requested_engines: ['fixture-engine'],
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
        engine_outcomes: [{ engine: 'fixture-engine', status: 'success' }],
      },
      ...overrides,
    }],
  };
}

function completedPacket(packet: Record<string, any>, relevanceByUrl: Map<string, number>) {
  const completed = structuredClone(packet);
  for (const sample of completed.samples) {
    for (const candidate of sample.candidates) {
      candidate.relevance = relevanceByUrl.get(candidate.url) ?? 0;
      candidate.citation_supported = candidate.relevance >= 2;
    }
  }
  completed.reviewer = {
    id: `human-${completed.reviewer_slot}`,
    kind: 'human',
    completed_at: '2026-07-26T01:00:00.000Z',
  };
  return completed;
}

describe('multi-system search result pooling', () => {
  const systemA = capture([
    result(
      'https://example.com/shared?utm_source=a',
      'Shared result',
      'Short shared snippet.',
    ),
    result('https://example.com/a', 'A result', 'Only system A returns this result.'),
  ]);
  const systemB = capture([
    result(
      'https://example.com/shared',
      'Shared result with detail',
      'A substantially richer shared snippet selected deterministically.',
    ),
    result('https://example.com/b', 'B result', 'Only system B returns this result.'),
  ]);

  it('deduplicates canonical URLs while retaining every system rank and trace hash', () => {
    const pooled = poolLiveCaptures([
      { systemId: 'system-b', capture: systemB },
      { systemId: 'system-a', capture: systemA },
    ]);

    expect(pooled.kind).toBe('pooled-search-capture');
    expect(pooled.source_captures.map((source: any) => source.system_id))
      .toEqual(['system-a', 'system-b']);
    expect(pooled.samples[0].candidates).toHaveLength(3);

    const shared = pooled.samples[0].candidates
      .find((candidate: any) => candidate.canonical_url === 'https://example.com/shared');
    expect(shared).toEqual(expect.objectContaining({
      title: 'Shared result with detail',
      snippet: 'A substantially richer shared snippet selected deterministically.',
      systems: [
        expect.objectContaining({ system_id: 'system-a', rank: 1 }),
        expect.objectContaining({ system_id: 'system-b', rank: 1 }),
      ],
    }));
    expect(pooled.samples[0].system_runs).toEqual([
      expect.objectContaining({
        system_id: 'system-a',
        raw_response_sha256: systemA.samples[0].trace.raw_response_sha256,
      }),
      expect.objectContaining({
        system_id: 'system-b',
        raw_response_sha256: systemB.samples[0].trace.raw_response_sha256,
      }),
    ]);
    expect(poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: systemB },
    ])).toEqual(pooled);
  });

  it('preserves protocol and port boundaries and rejects non-HTTP URLs', () => {
    expect(canonicalizePoolUrl('https://example.com:8443/a?utm_source=x#section'))
      .toBe('https://example.com:8443/a');
    expect(canonicalizePoolUrl('http://example.com/a'))
      .not.toBe(canonicalizePoolUrl('https://example.com/a'));
    expect(() => canonicalizePoolUrl('ftp://example.com/a'))
      .toThrow(/HTTP/);
  });

  it('rejects a non-pool and query-set drift', () => {
    expect(() => poolLiveCaptures([{ systemId: 'only', capture: systemA }]))
      .toThrow(/at least two systems/);
    expect(() => poolLiveCaptures([
      { systemId: 'duplicate', capture: systemA },
      { systemId: 'duplicate', capture: systemB },
    ])).toThrow(/unique/);

    const drifted = structuredClone(systemB);
    drifted.samples[0].query = 'different query';
    expect(() => poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: drifted },
    ])).toThrow(/query metadata/);

    expect(() => poolLiveCaptures([
      { systemId: 'system-a', capture: capture([]) },
      { systemId: 'system-b', capture: capture([]) },
    ])).toThrow(/non-empty candidate pool/);
  });

  it('creates a pooled reviewer packet without system identity or original ranks', () => {
    const pooled = poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: systemB },
    ]);

    const packet = prepareBlindedReviewPacket(pooled, { reviewerSlot: 'reviewer-a' });
    const serialized = JSON.stringify(packet);

    expect(packet.samples[0].candidates).toHaveLength(3);
    expect(serialized).not.toContain('"systems"');
    expect(serialized).not.toContain('"system_runs"');
    expect(serialized).not.toContain('"rank"');
    expect(serialized).not.toContain('system-a');
    expect(serialized).not.toContain('system-b');
  });

  it('retains two completed reviews and exposes disagreements for human adjudication', () => {
    const pooled = poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: systemB },
    ]);
    const packetA = prepareBlindedReviewPacket(pooled, { reviewerSlot: 'reviewer-a' });
    const packetB = prepareBlindedReviewPacket(pooled, { reviewerSlot: 'reviewer-b' });
    const urls = pooled.samples[0].candidates.map((candidate: any) => candidate.url);
    const reviewA = completedPacket(packetA, new Map([
      [urls[0], 3],
      [urls[1], 2],
      [urls[2], 0],
    ]));
    const reviewB = completedPacket(packetB, new Map([
      [urls[0], 2],
      [urls[1], 2],
      [urls[2], 0],
    ]));

    const adjudication = prepareReviewAdjudication(pooled, [reviewA, reviewB]);

    expect(adjudication.status).toBe('pending-adjudication');
    expect(adjudication.reviewers).toEqual([
      {
        id: 'human-reviewer-a',
        kind: 'human',
        reviewer_slot: 'reviewer-a',
      },
      {
        id: 'human-reviewer-b',
        kind: 'human',
        reviewer_slot: 'reviewer-b',
      },
    ]);
    expect(adjudication.summary).toEqual({
      candidates: 3,
      agreements: 2,
      disagreements: 1,
    });
    expect(adjudication.reviewer_agreement).toEqual({
      reviewer_pairs: 1,
      judged_candidates: 3,
      relevance: {
        raw_agreement_percent: 66.7,
        mean_pairwise_quadratic_weighted_kappa: 0.87,
        defined_pairs: 1,
      },
      citation_support: {
        raw_agreement_percent: 100,
        mean_pairwise_cohens_kappa: 1,
        defined_pairs: 1,
      },
    });
    const disagreement = adjudication.samples[0].candidates
      .find((candidate: any) => candidate.agreement === false);
    expect(disagreement.judgments).toHaveLength(2);
    expect(disagreement.final).toEqual({
      relevance: null,
      citation_supported: null,
    });

    const completed = structuredClone(adjudication);
    completed.status = 'completed';
    completed.adjudicator = {
      id: 'human-adjudicator',
      kind: 'human',
      completed_at: '2026-07-26T02:00:00.000Z',
    };
    for (const sample of completed.samples) {
      for (const candidate of sample.candidates) {
        const first = candidate.judgments[0];
        candidate.final = {
          relevance: first.relevance,
          citation_supported: first.citation_supported,
        };
      }
    }

    expect(validateCompletedAdjudication(completed).status).toBe('completed');

    const tamperedAgreement = structuredClone(completed);
    tamperedAgreement.reviewer_agreement.relevance.raw_agreement_percent = 100;
    expect(() => validateCompletedAdjudication(tamperedAgreement))
      .toThrow(/reviewer agreement/);
  });

  it('reports undefined kappa when both reviewers use only one category', () => {
    const pooled = poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: systemB },
    ]);
    const reviews = ['reviewer-a', 'reviewer-b'].map(reviewerSlot =>
      completedPacket(
        prepareBlindedReviewPacket(pooled, { reviewerSlot }),
        new Map(),
      ));

    const adjudication = prepareReviewAdjudication(pooled, reviews);

    expect(adjudication.reviewer_agreement.relevance).toEqual({
      raw_agreement_percent: 100,
      mean_pairwise_quadratic_weighted_kappa: null,
      defined_pairs: 0,
    });
    expect(adjudication.reviewer_agreement.citation_support).toEqual({
      raw_agreement_percent: 100,
      mean_pairwise_cohens_kappa: null,
      defined_pairs: 0,
    });
  });

  it('rejects incomplete reviews and mismatched source pools', () => {
    const pooled = poolLiveCaptures([
      { systemId: 'system-a', capture: systemA },
      { systemId: 'system-b', capture: systemB },
    ]);
    const incomplete = prepareBlindedReviewPacket(pooled, { reviewerSlot: 'reviewer-a' });
    const complete = completedPacket(
      prepareBlindedReviewPacket(pooled, { reviewerSlot: 'reviewer-b' }),
      new Map(),
    );
    expect(() => prepareReviewAdjudication(pooled, [incomplete, complete]))
      .toThrow(/complete/);

    const wrongPool = structuredClone(complete);
    wrongPool.source_fixture_sha256 = 'f'.repeat(64);
    expect(() => prepareReviewAdjudication(pooled, [
      completedPacket(incomplete, new Map()),
      wrongPool,
    ])).toThrow(/source pool/);
  });
});
