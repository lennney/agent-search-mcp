import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrichResults } from '../src/aggregation/enricher.js';
import type { ScoredResult } from '../src/aggregation/scorer.js';

function makeResult(confidence = 0.2): ScoredResult {
  return {
    title: 'Result',
    url: 'https://example.com/result',
    snippet: 'Short',
    source: 'duckduckgo',
    engines: ['duckduckgo'],
    confidence,
    relevance: 0.7,
    source_count: 1,
    score: 0.7,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enrichResults', () => {
  it('returns an empty enrichment result for empty input', async () => {
    await expect(enrichResults([])).resolves.toEqual({
      enriched: 0,
      failures: 0,
      results: [],
    });
  });

  it('improves the snippet without treating extraction as corroboration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Extracted evidence', { status: 200 })));
    const original = makeResult(0.2);

    const result = await enrichResults([original], { maxEnrich: 1 });

    expect(result.enriched).toBe(1);
    expect(result.results[0].snippet).toBe('Extracted evidence');
    expect(result.results[0].confidence).toBe(original.confidence);
    expect(result.results[0].source_count).toBe(original.source_count);
  });

  it('passes cancellation to extraction and propagates AbortError', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));
    const controller = new AbortController();
    const pending = enrichResults([makeResult()], { signal: controller.signal });
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps the original result when extraction fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    const original = makeResult(0.35);

    const result = await enrichResults([original], { maxEnrich: 1 });

    expect(result.enriched).toBe(0);
    expect(result.failures).toBe(1);
    expect(result.results[0]).toBe(original);
  });
});
