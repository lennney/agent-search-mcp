import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { normalizeExternalCapture } from '../../benchmarks/lib/external-capture.mjs';
import { poolLiveCaptures } from '../../benchmarks/lib/pooling.mjs';

const querySet = [{
  id: 'q1',
  query: 'Model Context Protocol definition',
  language: 'en',
  category: 'factual',
  freshness: 'evergreen',
  question: 'What is MCP?',
  reference_answer: 'A protocol for connecting AI applications to tools and data.',
}];

function externalInput(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    kind: 'external-search-results',
    captured_at: '2026-07-26T10:00:00.000Z',
    system: {
      id: 'comparison-search',
      version: '2026-07-26',
    },
    content_licenses: {
      'comparison-search': {
        license: 'Provider terms verified for benchmark retention',
      },
    },
    samples: [{
      id: 'q1',
      duration_ms: 125,
      results: [{
        title: 'Model Context Protocol',
        url: 'https://example.com/mcp?utm_source=benchmark',
        snippet: 'A protocol for connecting AI applications to external systems.',
      }],
    }],
    ...overrides,
  };
}

describe('external comparison capture import', () => {
  it('normalizes an offline export into a traced live capture', () => {
    const input = externalInput();
    const capture = normalizeExternalCapture(input, querySet);
    const response = capture.samples[0].response;

    expect(capture).toEqual(expect.objectContaining({
      schema_version: 1,
      kind: 'live-capture',
      package_version: '2026-07-26',
      requested_engines: ['comparison-search'],
      query_set_sha256: createHash('sha256')
        .update(JSON.stringify(querySet))
        .digest('hex'),
      capture_origin: expect.objectContaining({
        kind: 'external-import',
        system_id: 'comparison-search',
        source_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(capture.samples[0]).toEqual(expect.objectContaining(querySet[0]));
    expect(response.results[0]).toEqual({
      title: 'Model Context Protocol',
      url: 'https://example.com/mcp?utm_source=benchmark',
      snippet: 'A protocol for connecting AI applications to external systems.',
      sources: ['comparison-search'],
    });
    expect(capture.samples[0].trace.raw_response_sha256).toBe(
      createHash('sha256').update(JSON.stringify(response)).digest('hex'),
    );
    expect(capture.samples[0].trace.engine_outcomes).toEqual([{
      engine: 'comparison-search',
      status: 'success',
    }]);
  });

  it('uses the repository query set as authoritative metadata', () => {
    const input = externalInput();
    input.samples[0].query = 'attempted query substitution';
    const capture = normalizeExternalCapture(input, querySet);

    expect(capture.samples[0].query).toBe(querySet[0].query);
    expect(JSON.stringify(capture)).not.toContain('attempted query substitution');
  });

  it('supports an explicit failed sample without inventing results', () => {
    const input = externalInput({
      samples: [{
        id: 'q1',
        duration_ms: 400,
        failure_type: 'timeout',
      }],
    });
    const capture = normalizeExternalCapture(input, querySet);

    expect(capture.samples[0]).toEqual(expect.objectContaining({
      id: 'q1',
      duration_ms: 400,
      error: 'external:timeout',
    }));
    expect(capture.samples[0]).not.toHaveProperty('response');
    expect(capture.samples[0]).not.toHaveProperty('trace');
  });

  it.each([
    ['missing license', { content_licenses: {} }],
    ['sample coverage drift', { samples: [] }],
    ['sample ID drift', { samples: [{ id: 'other', duration_ms: 1, results: [] }] }],
    ['unrecognized failure type', {
      samples: [{ id: 'q1', duration_ms: 1, failure_type: 'raw secret text' }],
    }],
    ['non-HTTP URL', {
      samples: [{
        id: 'q1',
        duration_ms: 1,
        results: [{ title: 'bad', url: 'file:///secret', snippet: 'bad' }],
      }],
    }],
  ])('rejects %s', (_name, override) => {
    expect(() => normalizeExternalCapture(
      externalInput(override),
      querySet,
    )).toThrow('Invalid external capture');
  });

  it('can enter the existing pool without a comparison SDK dependency', () => {
    const comparison = normalizeExternalCapture(externalInput(), querySet);
    const agentSearch = structuredClone(comparison);
    agentSearch.package_version = '3.1.3';
    agentSearch.requested_engines = ['duckduckgo'];
    agentSearch.samples[0].response.results[0].url = 'https://agent.example/mcp';
    agentSearch.samples[0].response.results[0].sources = ['duckduckgo'];
    agentSearch.samples[0].trace.raw_response_sha256 = createHash('sha256')
      .update(JSON.stringify(agentSearch.samples[0].response))
      .digest('hex');

    const pool = poolLiveCaptures([
      { systemId: 'agent-search', capture: agentSearch },
      { systemId: 'comparison', capture: comparison },
    ]);

    expect(pool.source_captures.map(item => item.system_id))
      .toEqual(['agent-search', 'comparison']);
    expect(pool.samples[0].candidates).toHaveLength(2);
  });
});
