import { describe, expect, it } from 'vitest';

import {
  evaluateRunnerQualification,
  observeSearchFailure,
  observeSearchResponse,
  qualificationQueryDelayMs,
  runnerQualificationExitCode,
} from '../../benchmarks/lib/runner-qualification.mjs';

function response(
  url: string,
  sources: string[],
  failures: Array<Record<string, string>> = [],
) {
  return {
    query: 'secret query text',
    results: [{
      title: 'Third-party title',
      url,
      snippet: 'Third-party snippet',
      sources,
    }],
    meta: {
      execution: {
        searched_engines: sources,
      },
    },
    partialFailures: failures,
  };
}

function system(systemId: string, observation: Record<string, unknown>) {
  return { system_id: systemId, ...observation };
}

describe('benchmark runner qualification', () => {
  const systems = [
    { system_id: 'agent-search', engines: ['duckduckgo', 'wikipedia'] },
    { system_id: 'baseline', engines: ['wikipedia'] },
  ];

  it('retains only hashes and operational metadata from live responses', () => {
    const observation = observeSearchResponse(
      response(
        'https://example.com/article?utm_source=test#section',
        ['duckduckgo'],
        [{ engine: 'sogou', type: 'upstream_4xx', message: 'raw failure' }],
      ),
      42,
    );
    const serialized = JSON.stringify(observation);

    expect(observation).toEqual(expect.objectContaining({
      status: 'non-empty',
      duration_ms: 42,
      result_count: 1,
      provider_families: ['bing'],
      partial_failures: [{ engine: 'sogou', type: 'upstream_4xx' }],
    }));
    expect(observation.result_ids[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('Third-party');
    expect(serialized).not.toContain('secret query');
    expect(serialized).not.toContain('raw failure');
  });

  it('marks a diverse two-system probe ready', () => {
    const samples = ['q1', 'q2'].map((id, index) => ({
      id,
      systems: [
        system('agent-search', observeSearchResponse(
          response(`https://ddg.example/${index}`, ['duckduckgo']),
          10,
        )),
        system('baseline', observeSearchResponse(
          response(`https://wikipedia.example/${index}`, ['wikipedia']),
          12,
        )),
      ],
    }));
    const report = evaluateRunnerQualification({
      query_set_sha256: 'a'.repeat(64),
      systems,
      samples,
    }, { minimumQueries: 2 });

    expect(report.readiness).toEqual({
      status: 'ready',
      minimum_queries: 2,
      minimum_provider_families: 2,
      observed_queries: 2,
      qualified_queries: 2,
      reasons: [],
    });
    expect(report.samples.every(sample => sample.pool_probe.qualified)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('"result_ids"');
    expect(report.samples[0].systems[0]).toEqual(expect.objectContaining({
      candidate_set_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      ranking_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(runnerQualificationExitCode(report)).toBe(0);
  });

  it('rejects identical single-family results as a fake multi-system pool', () => {
    const shared = response('https://wikipedia.example/shared', ['wikipedia']);
    const report = evaluateRunnerQualification({
      query_set_sha256: 'b'.repeat(64),
      systems,
      samples: [{
        id: 'q1',
        systems: [
          system('agent-search', observeSearchResponse(shared, 10)),
          system('baseline', observeSearchResponse(shared, 12)),
        ],
      }],
    }, { minimumQueries: 1 });

    expect(report.readiness.status).toBe('insufficient-runner');
    expect(report.samples[0].pool_probe).toEqual(expect.objectContaining({
      qualified: false,
      reasons: [
        'provider_family_diversity',
        'ranking_or_candidate_diversity',
      ],
      distinct_rankings: 1,
    }));
    expect(runnerQualificationExitCode(report)).toBe(2);
  });

  it('rejects an unknown readiness state instead of failing open', () => {
    expect(() => runnerQualificationExitCode({
      readiness: { status: 'unknown' },
    })).toThrow('report readiness status is invalid');
  });

  it('uses conservative bounded pacing for live qualification probes', () => {
    expect(qualificationQueryDelayMs(undefined)).toBe(10_000);
    expect(qualificationQueryDelayMs('2500')).toBe(2_500);
    expect(() => qualificationQueryDelayMs('999')).toThrow(
      'query delay must be an integer from 1000 to 60000 ms',
    );
    expect(() => qualificationQueryDelayMs('60001')).toThrow(
      'query delay must be an integer from 1000 to 60000 ms',
    );
  });

  it('retains only the error class for failed probes', () => {
    const observation = observeSearchFailure(
      new TypeError('secret upstream response'),
      20,
    );

    expect(observation).toEqual({
      status: 'failed',
      duration_ms: 20,
      result_count: 0,
      result_ids: [],
      provider_families: [],
      searched_engines: [],
      partial_failures: [],
      error_type: 'TypeError',
    });
    expect(JSON.stringify(observation)).not.toContain('secret upstream');
  });
});
