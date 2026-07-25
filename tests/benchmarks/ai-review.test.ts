import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createOpenAiResponsesJudge,
  runAiAdjudication,
  runAiReview,
} from '../../benchmarks/lib/ai-review.mjs';
import { evaluatePooledComparison } from '../../benchmarks/lib/comparison-metrics.mjs';
import {
  poolLiveCaptures,
  prepareReviewAdjudication,
  validateCompletedAdjudication,
} from '../../benchmarks/lib/pooling.mjs';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function capture(system: string, results: Array<Record<string, string>>) {
  const response = {
    query: 'alpha query',
    results,
    partialFailures: [],
  };
  return {
    schema_version: 1,
    kind: 'live-capture',
    captured_at: '2026-07-26T00:00:00.000Z',
    package_version: '1.0.0',
    requested_engines: [system],
    content_licenses: {},
    samples: [{
      id: 'q1',
      query: 'alpha query',
      language: 'en',
      category: 'factual',
      freshness: 'evergreen',
      question: 'What is alpha?',
      reference_answer: 'Alpha is the first Greek letter.',
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

function pool() {
  return poolLiveCaptures([
    {
      systemId: 'system-a',
      capture: capture('engine-a', [{
        title: 'Alpha',
        url: 'https://example.com/alpha',
        snippet: 'Alpha is the first Greek letter.',
      }]),
    },
    {
      systemId: 'system-b',
      capture: capture('engine-b', [{
        title: 'Noise',
        url: 'https://example.com/noise',
        snippet: 'This does not answer the question.',
      }]),
    },
  ]);
}

function config(slot: string, modelFamily: string) {
  return {
    reviewerSlot: slot,
    provider: 'fixture-provider',
    model: `${modelFamily}-2026-07-26`,
    modelFamily,
    temperature: 0,
  };
}

function judge(overrides = new Map<string, number>()) {
  return vi.fn(async (request: Record<string, any>) => {
    const relevance = overrides.get(request.candidate.url)
      ?? (request.candidate.url.endsWith('/alpha') ? 3 : 0);
    return {
      output: {
        relevance,
        citation_supported: relevance >= 2,
        rationale: relevance >= 2
          ? 'The snippet directly supports the reference answer.'
          : 'The snippet does not answer the question.',
      },
      response: {
        id: `response-${request.task_id}`,
        model: request.judge.model,
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    };
  });
}

describe('AI search-quality review', () => {
  it('calls OpenAI Responses with strict structured output and no retained state', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: Record<string, any>) => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'resp-fixture',
        model: 'judge-model-2026-07-26',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              relevance: 3,
              citation_supported: true,
              rationale: 'Direct support.',
            }),
          }],
        }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    }));
    const callJudge = createOpenAiResponsesJudge({
      apiKey: 'test-key',
      fetchImpl,
      timeoutMs: 1000,
    });
    const request = {
      task_id: 'reviewer:q1:c1',
      judge: { model: 'judge-model-2026-07-26' },
      system_prompt: 'Judge safely.',
      schema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      query: 'alpha',
      candidate: {
        title: 'Alpha',
        url: 'https://example.com/alpha',
        snippet: 'Alpha evidence.',
      },
    };

    const result = await callJudge(request);

    expect(result.output).toEqual({
      relevance: 3,
      citation_supported: true,
      rationale: 'Direct support.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toEqual(expect.objectContaining({
      model: 'judge-model-2026-07-26',
      store: false,
      temperature: 0,
      tools: [],
      text: {
        format: expect.objectContaining({
          type: 'json_schema',
          strict: true,
        }),
      },
    }));
  });

  it('runs blinded pointwise judges and retains reproducible verdict evidence', async () => {
    const sourcePool = pool();
    const callJudge = judge();

    const packet = await runAiReview(
      sourcePool,
      config('judge-a', 'family-a'),
      callJudge,
      { completedAt: '2026-07-26T01:00:00.000Z' },
    );

    expect(packet.reviewer).toEqual(expect.objectContaining({
      kind: 'ai',
      provider: 'fixture-provider',
      model: 'family-a-2026-07-26',
      model_family: 'family-a',
      temperature: 0,
      prompt_version: 'search-relevance-v1',
      prompt_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      completed_at: '2026-07-26T01:00:00.000Z',
    }));
    expect(packet.samples[0].candidates[0]).toEqual(expect.objectContaining({
      relevance: expect.any(Number),
      citation_supported: expect.any(Boolean),
      rationale: expect.any(String),
      judge_evidence: {
        request_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        verdict_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        provider_response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        provider_response_id: expect.any(String),
        provider_model: 'family-a-2026-07-26',
      },
    }));
    expect(callJudge).toHaveBeenCalledTimes(2);
    for (const [request] of callJudge.mock.calls) {
      const serialized = JSON.stringify(request);
      expect(serialized).not.toContain('system-a');
      expect(serialized).not.toContain('system-b');
      expect(serialized).not.toContain('"rank"');
      expect(request.candidate).toEqual(expect.objectContaining({
        title: expect.any(String),
        url: expect.any(String),
        snippet: expect.any(String),
      }));
    }

    const queryUrlPool = pool();
    queryUrlPool.samples[0].candidates.forEach((candidate: Record<string, any>) => {
      candidate.url = 'https://user:secret@example.com/path?token=private#fragment';
    });
    const sanitizedJudge = judge();
    await runAiReview(
      queryUrlPool,
      config('judge-url', 'family-url'),
      sanitizedJudge,
    );
    for (const [request] of sanitizedJudge.mock.calls) {
      expect(request.candidate.url).toBe('https://example.com/path');
    }
  });

  it('uses two model families and a third-family adjudicator for disagreements', async () => {
    const sourcePool = pool();
    const first = await runAiReview(
      sourcePool,
      config('judge-a', 'family-a'),
      judge(),
      { completedAt: '2026-07-26T01:00:00.000Z' },
    );
    const second = await runAiReview(
      sourcePool,
      config('judge-b', 'family-b'),
      judge(new Map([['https://example.com/alpha', 2]])),
      { completedAt: '2026-07-26T01:01:00.000Z' },
    );

    const pending = prepareReviewAdjudication(sourcePool, [first, second]);

    expect(pending.review_mode).toBe('ai');
    expect(pending.reviewers.map((reviewer: Record<string, any>) =>
      reviewer.model_family)).toEqual(['family-a', 'family-b']);
    expect(pending.summary.disagreements).toBe(1);
    const disagreement = pending.samples[0].candidates
      .find((candidate: Record<string, any>) => !candidate.agreement);
    expect(disagreement.judgments[0].judge_evidence)
      .toEqual(first.samples[0].candidates
        .find((candidate: Record<string, any>) =>
          candidate.candidate_id === disagreement.candidate_id).judge_evidence);

    const completed = await runAiAdjudication(
      sourcePool,
      pending,
      config('adjudicator', 'family-c'),
      judge(),
      { completedAt: '2026-07-26T02:00:00.000Z' },
    );

    expect(completed.status).toBe('completed');
    expect(completed.adjudicator).toEqual(expect.objectContaining({
      kind: 'ai',
      model_family: 'family-c',
      completed_at: '2026-07-26T02:00:00.000Z',
    }));
    expect(disagreement.final).toEqual({
      relevance: null,
      citation_supported: null,
    });
    const resolved = completed.samples[0].candidates
      .find((candidate: Record<string, any>) => !candidate.agreement);
    expect(resolved.final).toEqual({
      relevance: 3,
      citation_supported: true,
    });
    expect(resolved.adjudication_evidence.verdict_sha256)
      .toMatch(/^[a-f0-9]{64}$/);
    expect(validateCompletedAdjudication(completed).status).toBe('completed');

    const report = evaluatePooledComparison(sourcePool, completed);
    expect(report.label_status).toBe('ai-reviewed');
    expect(report.claim_scope).toBe('ai-judged');
    expect(report.claim_readiness.checks.review_evidence).toEqual({
      passed: true,
      mode: 'ai',
      reviewers: 2,
      adjudicator_kind: 'ai',
    });
  });

  it('rejects correlated judges, mixed review modes, and reused adjudicator families', async () => {
    const sourcePool = pool();
    const first = await runAiReview(
      sourcePool,
      config('judge-a', 'same-family'),
      judge(),
    );
    const correlatedConfig = config('judge-b', 'same-family');
    correlatedConfig.model = 'same-family-2026-07-27';
    const correlated = await runAiReview(
      sourcePool,
      correlatedConfig,
      judge(),
    );
    expect(() => prepareReviewAdjudication(sourcePool, [first, correlated]))
      .toThrow(/model families/);

    const second = await runAiReview(
      sourcePool,
      config('judge-b', 'family-b'),
      judge(new Map([['https://example.com/alpha', 2]])),
    );
    const modelDrift = structuredClone(second);
    modelDrift.samples[0].candidates[0].judge_evidence.provider_model = 'other-model';
    expect(() => prepareReviewAdjudication(sourcePool, [first, modelDrift]))
      .toThrow(/incomplete/);
    const promptDrift = structuredClone(second);
    promptDrift.reviewer.prompt_sha256 = 'f'.repeat(64);
    expect(() => prepareReviewAdjudication(sourcePool, [first, promptDrift]))
      .toThrow(/metadata/);
    const pending = prepareReviewAdjudication(sourcePool, [first, second]);
    await expect(runAiAdjudication(
      sourcePool,
      pending,
      config('adjudicator', 'same-family'),
      judge(),
    )).rejects.toThrow(/third model family/);

    const human = structuredClone(first);
    human.reviewer = {
      id: 'human-reviewer',
      kind: 'human',
      completed_at: '2026-07-26T01:00:00.000Z',
    };
    for (const sample of human.samples) {
      for (const candidate of sample.candidates) {
        delete candidate.rationale;
        delete candidate.judge_evidence;
      }
    }
    expect(() => prepareReviewAdjudication(sourcePool, [human, second]))
      .toThrow(/same review mode/);

    const oversizedPool = pool();
    oversizedPool.samples[0].candidates.forEach((candidate: Record<string, any>) => {
      candidate.snippet = 'x'.repeat(6001);
    });
    const oversizedJudge = judge();
    await expect(runAiReview(
      oversizedPool,
      config('judge-c', 'family-c'),
      oversizedJudge,
    )).rejects.toThrow(/candidate snippet/);
    expect(oversizedJudge).not.toHaveBeenCalled();
  });
});
