import { describe, expect, it } from 'vitest';

import {
  buildCaptureTrace,
  evaluateQualityFixture,
  prepareBlindedReviewPacket,
  prepareHumanLabelTemplate,
  validateQualityFixture,
} from '../../benchmarks/lib/quality-metrics.mjs';

function makeFixture(labelStatus: 'bootstrap' | 'human-verified' = 'bootstrap') {
  const fixture: any = {
    schema_version: 1,
    kind: 'labeled-search-quality',
    labeling: {
      status: labelStatus,
      relevance_scale: { min: 0, max: 3, relevant_threshold: 2 },
      ...(labelStatus === 'human-verified' ? {
        reviewers: [
          { id: 'reviewer-1', kind: 'human' },
          { id: 'reviewer-2', kind: 'human' },
        ],
        verified_at: '2026-07-26T00:00:00.000Z',
        adjudication: {
          status: 'completed',
          adjudicator_id: 'reviewer-1',
        },
      } : {}),
    },
    samples: [
      {
        id: 'en-1',
        query: 'alpha',
        language: 'en',
        category: 'factual',
        freshness: 'evergreen',
        response: {
          results: [
            { title: 'A', url: 'https://example.com/a', snippet: 'Alpha answer' },
            { title: 'B', url: 'https://example.com/b', snippet: 'Background' },
          ],
          partialFailures: [{ engine: 'bing', error: 'timeout' }],
        },
        trace: {
          duration_ms: 1000,
          raw_response_sha256: 'a'.repeat(64),
          engine_outcomes: [
            { engine: 'duckduckgo', status: 'success' },
            { engine: 'bing', status: 'failed' },
          ],
        },
        labels: {
          answer_correct: true,
          results: [
            { url: 'https://example.com/a', relevance: 3, citation_supported: true },
            { url: 'https://example.com/b', relevance: 1, citation_supported: false },
          ],
        },
      },
      {
        id: 'zh-1',
        query: '测试',
        language: 'zh',
        category: 'factual',
        freshness: 'evergreen',
        response: {
          results: [
            { title: 'D', url: 'https://example.cn/d', snippet: '无关内容' },
            { title: 'C', url: 'https://example.cn/c', snippet: '相关内容' },
          ],
          partialFailures: [],
        },
        trace: {
          duration_ms: 3000,
          raw_response_sha256: 'b'.repeat(64),
          engine_outcomes: [
            { engine: 'sogou', status: 'success' },
            { engine: 'baidu', status: 'failed' },
          ],
        },
        labels: {
          answer_correct: false,
          results: [
            { url: 'https://example.cn/d', relevance: 0, citation_supported: false },
            { url: 'https://example.cn/c', relevance: 2, citation_supported: false },
          ],
        },
      },
    ],
  };
  for (const sample of fixture.samples) {
    sample.trace.raw_response_sha256 = buildCaptureTrace(sample.response, {
      durationMs: sample.trace.duration_ms,
      requestedEngines: sample.trace.engine_outcomes.map(outcome => outcome.engine),
      startedAt: '2026-07-26T00:00:00.000Z',
    }).raw_response_sha256;
  }
  if (labelStatus === 'human-verified') {
    for (const sample of fixture.samples) {
      sample.reviews = fixture.labeling.reviewers.map((reviewer: { id: string }) => ({
        reviewer_id: reviewer.id,
        answer_correct: sample.labels.answer_correct,
        results: structuredClone(sample.labels.results),
      }));
    }
  }
  return fixture;
}

describe('quality benchmark metrics', () => {
  it('builds an inspectable trace without changing the raw response', () => {
    const response = {
      results: [],
      meta: {
        execution: {
          searched_engines: ['duckduckgo', 'bing'],
        },
      },
      partialFailures: [{ engine: 'bing', error: 'timeout' }],
    };

    const trace = buildCaptureTrace(response, {
      durationMs: 321,
      requestedEngines: ['duckduckgo', 'bing', 'baidu'],
      startedAt: '2026-07-26T00:00:00.000Z',
    });

    expect(trace).toEqual(expect.objectContaining({
      started_at: '2026-07-26T00:00:00.000Z',
      duration_ms: 321,
      raw_response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      engine_outcomes: [
        { engine: 'duckduckgo', status: 'success' },
        { engine: 'bing', status: 'failed' },
        { engine: 'baidu', status: 'skipped' },
      ],
    }));
    expect(response).not.toHaveProperty('trace');
  });

  it('converts a raw capture into a pending human-label template', () => {
    const fixture = makeFixture();
    const capture = {
      schema_version: 1,
      kind: 'live-capture',
      samples: fixture.samples.map(sample => ({
        id: sample.id,
        query: sample.query,
        language: sample.language,
        category: sample.category,
        freshness: sample.freshness,
        question: 'What is the expected answer?',
        reference_answer: 'Expected answer for reviewer comparison.',
        response: sample.response,
        trace: sample.trace,
      })),
    };

    const template = prepareHumanLabelTemplate(capture);

    expect(template.labeling.status).toBe('pending-human');
    expect(template.samples[0].response).toBe(capture.samples[0].response);
    expect(template.samples[0].trace).toBe(capture.samples[0].trace);
    expect(template.samples[0]).toEqual(expect.objectContaining({
      category: 'factual',
      freshness: 'evergreen',
      question: 'What is the expected answer?',
      reference_answer: 'Expected answer for reviewer comparison.',
    }));
    expect(template.samples[0].labels).toEqual({
      answer_correct: null,
      results: [
        {
          url: 'https://example.com/a',
          relevance: null,
          citation_supported: null,
        },
        {
          url: 'https://example.com/b',
          relevance: null,
          citation_supported: null,
        },
      ],
    });
  });

  it('creates a deterministic reviewer packet without engine or score provenance', () => {
    const fixture = makeFixture();
    fixture.samples[0].question = 'Which result supports the answer?';
    fixture.samples[0].reference_answer = 'Alpha is the expected answer.';
    fixture.content_licenses = {
      wikipedia: { license: 'CC BY-SA 4.0' },
    };
    const packet = prepareBlindedReviewPacket(fixture, { reviewerSlot: 'reviewer-a' });

    expect(packet.kind).toBe('blinded-search-review');
    expect(packet.reviewer_slot).toBe('reviewer-a');
    expect(packet.content_licenses).toEqual(fixture.content_licenses);
    expect(packet.samples[0]).toEqual(expect.objectContaining({
      question: 'Which result supports the answer?',
      reference_answer: 'Alpha is the expected answer.',
    }));
    const firstSourceResult = fixture.samples[0].response.results[0];
    const matchingCandidate = packet.samples[0].candidates
      .find(candidate => candidate.url === firstSourceResult.url);
    expect(matchingCandidate).toEqual({
      candidate_id: expect.stringMatching(/^c-[a-f0-9]{12}$/),
      title: fixture.samples[0].response.results[0].title,
      url: fixture.samples[0].response.results[0].url,
      snippet: fixture.samples[0].response.results[0].snippet,
      relevance: null,
      citation_supported: null,
    });
    expect(prepareBlindedReviewPacket(fixture, { reviewerSlot: 'reviewer-a' }))
      .toEqual(packet);
    expect(packet.samples[0].candidates.map(candidate => candidate.url))
      .not.toEqual(fixture.samples[0].response.results.map(result => result.url));
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toContain('"sources"');
    expect(serialized).not.toContain('"source_count"');
    expect(serialized).not.toContain('"confidence"');
    expect(serialized).not.toContain('"engine_outcomes"');
  });

  it('reports quality, citation, token, latency, and failure transparency separately', () => {
    const report = evaluateQualityFixture(makeFixture(), {
      tokenCounter: () => 100,
    });

    expect(report.summary).toEqual({
      evaluated_queries: 2,
      labeled_results: 4,
      label_status: 'bootstrap',
      quality_claim_eligible: false,
      quality: {
        answer_accuracy_percent: 50,
        ndcg_at_5_percent: 81.5,
        precision_at_5_percent: 50,
        reciprocal_rank_at_5_percent: 75,
        success_at_5_percent: 100,
      },
      citation_support: {
        supported_relevant_results: 1,
        relevant_results: 2,
        rate_percent: 50,
      },
      token_efficiency: {
        total_response_tokens: 200,
        correct_answers: 1,
        tokens_per_correct_answer: 200,
      },
      latency: {
        average_ms: 2000,
        p50_ms: 1000,
        p95_ms: 3000,
      },
      failure_transparency: {
        expected_failures: 2,
        disclosed_failures: 1,
        undisclosed_failures: 1,
        disclosure_rate_percent: 50,
      },
      raw_trace_coverage_percent: 100,
    });
    expect(report.slices.language).toEqual({
      en: expect.objectContaining({
        queries: 1,
        answer_accuracy_percent: 100,
        ndcg_at_5_percent: 100,
      }),
      zh: expect.objectContaining({
        queries: 1,
        answer_accuracy_percent: 0,
        ndcg_at_5_percent: 63.1,
      }),
    });
    expect(report.slices.category.factual.queries).toBe(2);
    expect(report.slices.freshness.evergreen.queries).toBe(2);
  });

  it('requires explicit human verification before quality claims are eligible', () => {
    expect(() => validateQualityFixture(makeFixture(), { requireHuman: true }))
      .toThrow(/human-verified/);

    const verified = makeFixture('human-verified');
    expect(validateQualityFixture(verified, { requireHuman: true }).labeling.status)
      .toBe('human-verified');
  });

  it('requires independent per-result review evidence for human verification', () => {
    const fixture = makeFixture('human-verified');
    delete fixture.samples[0].reviews;

    expect(() => validateQualityFixture(fixture, { requireHuman: true }))
      .toThrow(/independent reviews/);
  });

  it('rejects an all-zero-result fixture at the public quality gate', () => {
    const fixture = makeFixture('human-verified');
    for (const sample of fixture.samples) {
      sample.response.results = [];
      sample.labels.results = [];
      sample.reviews.forEach((review: { results: unknown[] }) => {
        review.results = [];
      });
      sample.trace.raw_response_sha256 = buildCaptureTrace(sample.response, {
        durationMs: sample.trace.duration_ms,
        requestedEngines: sample.trace.engine_outcomes.map(
          (outcome: { engine: string }) => outcome.engine,
        ),
        startedAt: sample.trace.started_at,
      }).raw_response_sha256;
    }

    expect(() => evaluateQualityFixture(fixture, { requireHuman: true }))
      .toThrow(/non-empty pooled capture/);
  });

  it('rejects labels that do not map to a returned result URL', () => {
    const fixture = makeFixture();
    fixture.samples[0].labels.results[0].url = 'https://example.com/missing';

    expect(() => validateQualityFixture(fixture)).toThrow(/missing/);
  });

  it('rejects duplicate engine outcomes that would distort failure metrics', () => {
    const fixture = makeFixture();
    fixture.samples[0].trace.engine_outcomes.push({
      engine: 'bing',
      status: 'failed',
    });

    expect(() => validateQualityFixture(fixture)).toThrow(/engine outcomes must be unique/);
  });
});
