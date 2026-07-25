import { describe, expect, it } from 'vitest';

import { parseEngineSelection } from '../../benchmarks/lib/capture-options.mjs';

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
});
