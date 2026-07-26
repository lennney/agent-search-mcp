import { describe, expect, it } from 'vitest';

import {
  parseEngineSelection,
  selectBenchmarkQueries,
} from '../../benchmarks/lib/capture-options.mjs';

const AVAILABLE_ENGINES = ['duckduckgo', 'wikipedia', 'brave'];

describe('benchmark capture options', () => {
  it('uses all available engines when no selection is provided', () => {
    expect(parseEngineSelection(undefined, AVAILABLE_ENGINES))
      .toEqual(AVAILABLE_ENGINES);
  });

  it('parses, trims, and deduplicates an explicit engine selection', () => {
    expect(parseEngineSelection(
      ' wikipedia, duckduckgo,wikipedia ',
      AVAILABLE_ENGINES,
    )).toEqual(['wikipedia', 'duckduckgo']);
  });

  it('rejects empty and unknown engine selections', () => {
    expect(() => parseEngineSelection(' , ', AVAILABLE_ENGINES))
      .toThrow(/at least one engine/);
    expect(() => parseEngineSelection('wikipedia,unknown', AVAILABLE_ENGINES))
      .toThrow(/unknown/);
  });

  it('selects a balanced bilingual subset without duplicating queries', () => {
    const querySet = [
      { id: 'en-1', lang: 'en' },
      { id: 'en-2', lang: 'en' },
      { id: 'en-3', lang: 'en' },
      { id: 'zh-1', lang: 'zh' },
      { id: 'zh-2', lang: 'zh' },
      { id: 'zh-3', lang: 'zh' },
    ];

    expect(selectBenchmarkQueries(querySet, 4).map(query => query.id))
      .toEqual(['en-1', 'en-2', 'zh-1', 'zh-2']);
    expect(selectBenchmarkQueries({ queries: querySet }, 5))
      .toHaveLength(5);
  });

  it('fills from the available language when a balanced split is impossible', () => {
    const querySet = [
      { id: 'en-1', lang: 'en' },
      { id: 'en-2', lang: 'en' },
      { id: 'en-3', lang: 'en' },
      { id: 'zh-1', lang: 'zh' },
    ];

    expect(selectBenchmarkQueries(querySet, 3).map(query => query.id))
      .toEqual(['en-1', 'en-2', 'zh-1']);
    expect(selectBenchmarkQueries(querySet, 4).map(query => query.id))
      .toEqual(['en-1', 'en-2', 'en-3', 'zh-1']);
  });

  it('rejects empty query sets and invalid limits', () => {
    expect(() => selectBenchmarkQueries([], 1)).toThrow(/non-empty/);
    expect(() => selectBenchmarkQueries([{ id: 'q1' }], 0)).toThrow(/integer/);
    expect(() => selectBenchmarkQueries([{ id: 'q1' }], 2)).toThrow(/integer/);
  });
});
