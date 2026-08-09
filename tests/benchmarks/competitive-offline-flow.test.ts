import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { runAiAdjudication, runAiReview } from '../../benchmarks/lib/ai-review.mjs';
import { evaluatePooledComparison } from '../../benchmarks/lib/comparison-metrics.mjs';
import {
  poolLiveCaptures,
  prepareReviewAdjudication,
  validateCompletedAdjudication,
} from '../../benchmarks/lib/pooling.mjs';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function makeCapture(systemId: string, systemIndex: number, queries: Array<Record<string, any>>) {
  const samples = queries.map((query, queryIndex) => {
    const canonicalResults = Array.from({ length: 5 }, (_, index) => ({
      title: `${query.id} reference ${index + 1}`,
      url: `https://benchmark.example/${query.id}/${index + 1}`,
      snippet: `${query.reference_answer} Evidence variant ${index + 1}.`,
      confidence: 0.9 - index * 0.05,
      relevance: 0.85 - index * 0.05,
      source_count: 1,
      sources: [systemId],
    }));
    const rotation = systemIndex % canonicalResults.length;
    const results = [
      ...canonicalResults.slice(rotation),
      ...canonicalResults.slice(0, rotation),
    ];
    const response = {
      query: query.query,
      engines: [systemId],
      results,
      meta: {
        total: 5,
        execution: { searched_engines: [systemId], engine_calls: 1 },
      },
      partialFailures: [],
    };
    return {
      ...query,
      duration_ms: 100 + systemIndex * 20 + queryIndex,
      response,
      trace: {
        started_at: '2026-08-07T00:00:00.000Z',
        duration_ms: 100 + systemIndex * 20 + queryIndex,
        raw_response_sha256: sha256(response),
        engine_outcomes: [{ engine: systemId, status: 'success' }],
      },
    };
  });
  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: '2026-08-07T00:00:00.000Z',
    package_version: 'synthetic',
    query_set_sha256: sha256(queries),
    requested_engines: [systemId],
    content_licenses: {},
    capture_contract_version: 2,
    capture_status: 'complete',
    expected_sample_count: 30,
    completed_sample_count: 30,
    result_limit: 5,
    capture_configuration_sha256: sha256({ systemId, result_limit: 5 }),
    system_version_sha256: sha256({ systemId, version: 'synthetic' }),
    samples,
  };
}

function config(slot: string, family: string) {
  return {
    reviewerSlot: slot,
    provider: 'synthetic-provider',
    model: `${family}-2026-08-07`,
    modelFamily: family,
    temperature: 0,
  };
}

function judge(overridesFirstResult = false) {
  let responseId = 0;
  return vi.fn(async (request: Record<string, any>) => {
    const resultIndex = Number.parseInt(request.candidate.url.split('/').at(-1), 10);
    const relevance = overridesFirstResult && resultIndex === 1
      ? 2
      : Math.max(0, 4 - resultIndex);
    return {
      output: {
        relevance,
        citation_supported: relevance >= 2,
        rationale: relevance >= 2 ? 'The visible snippet supports the reference.' : 'The visible snippet is weak.',
      },
      response: {
        id: `synthetic-${responseId += 1}`,
        model: request.judge.model,
        usage: { input_tokens: 50, output_tokens: 12 },
      },
    };
  });
}

describe('30-query three-system offline acceptance', () => {
  it('runs pooling, two blinded reviews, disagreement adjudication, and reporting end to end', async () => {
    const querySet = JSON.parse(await readFile(
      'benchmarks/queries/competitive-comparison-v1.json',
      'utf8',
    ));
    const systems = [
      'agent-search-free-waterfall',
      'open-websearch-2.1.9',
      'ddgs-9.14.4',
    ];
    const sourcePool = poolLiveCaptures(systems.map((systemId, index) => ({
      systemId,
      capture: makeCapture(systemId, index, querySet.queries),
    })), { requireComplete: true });

    expect(sourcePool.source_captures.map((source: Record<string, any>) => source.system_id))
      .toEqual([...systems].sort());
    expect(sourcePool.samples).toHaveLength(30);
    expect(sourcePool.samples[0].system_runs).toHaveLength(3);
    expect(sourcePool.samples[0].candidates[0].systems[0])
      .toEqual(expect.objectContaining({ rank: expect.any(Number) }));

    const firstJudge = judge(false);
    const secondJudge = judge(true);
    const first = await runAiReview(
      sourcePool,
      config('judge-a', 'synthetic-a'),
      firstJudge,
      { completedAt: '2026-08-07T01:00:00.000Z' },
    );
    const second = await runAiReview(
      sourcePool,
      config('judge-b', 'synthetic-b'),
      secondJudge,
      { completedAt: '2026-08-07T01:05:00.000Z' },
    );

    expect(firstJudge).toHaveBeenCalledTimes(150);
    const reviewerRequests = JSON.stringify([
      ...firstJudge.mock.calls.map(call => call[0]),
      ...secondJudge.mock.calls.map(call => call[0]),
    ]);
    for (const systemId of systems) expect(reviewerRequests).not.toContain(systemId);
    expect(reviewerRequests).not.toContain('routing_signals');
    expect(reviewerRequests).not.toContain('"rank"');

    const pending = prepareReviewAdjudication(sourcePool, [first, second]);
    expect(pending.summary).toMatchObject({ candidates: 150, disagreements: 30 });
    const adjudicator = judge(false);
    const completed = await runAiAdjudication(
      sourcePool,
      pending,
      config('adjudicator', 'synthetic-c'),
      adjudicator,
      { completedAt: '2026-08-07T02:00:00.000Z' },
    );

    expect(adjudicator).toHaveBeenCalledTimes(30);
    expect(validateCompletedAdjudication(completed).status).toBe('completed');
    const report = evaluatePooledComparison(sourcePool, completed);
    expect(report).toMatchObject({
      kind: 'pooled-search-comparison',
      label_status: 'ai-reviewed',
      claim_scope: 'ai-judged',
      quality_claim_eligible: true,
      claim_readiness: { status: 'eligible' },
    });
    expect(Object.keys(report.systems).sort()).toEqual([...systems].sort());
    expect(Object.values(report.pairwise_comparisons)
      .every((comparison: any) => comparison.status === 'reported')).toBe(true);
  });
});
