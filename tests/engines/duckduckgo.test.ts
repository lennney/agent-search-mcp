import { describe, expect, it } from 'vitest';

import { duckduckgoProvider } from '../../src/engines/duckduckgo.js';

describe('DuckDuckGo engine', () => {
  it('has stable zero-key provider metadata', () => {
    expect(duckduckgoProvider).toMatchObject({
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      isFree: true,
    });
  });
});
