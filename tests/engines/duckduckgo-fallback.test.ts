import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/engines/duckduckgo-html.js', () => ({
  searchDuckDuckGoHtml: vi.fn(async () => [
    {
      title: 'HTML Fallback Result',
      url: 'https://html.ex/1',
      snippet: 'from HTML',
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    },
  ]),
}));

vi.mock('../../src/engines/duckduckgo-web.js', () => ({
  searchDuckDuckGoWeb: vi.fn(async () => [
    {
      title: 'Web Result',
      url: 'https://web.ex/1',
      snippet: 'from Web',
      source: 'duckduckgo',
      engines: ['duckduckgo'],
    },
  ]),
}));

import {
  searchDuckDuckGoHtml,
} from '../../src/engines/duckduckgo-html.js';
import { searchDuckDuckGo } from '../../src/engines/duckduckgo.js';
import { searchDuckDuckGoWeb } from '../../src/engines/duckduckgo-web.js';
import { EngineAdapterError } from '../../src/engines/engine-error.js';

describe('DDG Web → HTML → Lite chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the page-issued Web representation first', async () => {
    const results = await searchDuckDuckGo('test query', 5);

    expect(results[0].title).toBe('Web Result');
    expect(searchDuckDuckGoWeb).toHaveBeenCalledWith('test query', 5, {
      throwOnError: true,
    });
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('falls through to HTML when Web returns no results', async () => {
    vi.mocked(searchDuckDuckGoWeb).mockResolvedValueOnce([]);

    const results = await searchDuckDuckGo('test query', 5);

    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });

  it('falls through to HTML after an ordinary Web failure', async () => {
    vi.mocked(searchDuckDuckGoWeb).mockRejectedValueOnce(
      new Error('DuckDuckGo Web unavailable'),
    );

    const results = await searchDuckDuckGo('test query', 5);

    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });

  it.each(['bot_challenge', 'validation_error'] as const)(
    'does not rotate representations after a structural %s failure',
    async failureType => {
      vi.mocked(searchDuckDuckGoWeb).mockRejectedValueOnce(
        new EngineAdapterError(
          failureType,
          `DuckDuckGo Web ${failureType}`,
          {
            retryable: false,
            cooldownMs: failureType === 'bot_challenge'
              ? 3_600_000
              : undefined,
            suggestion: 'Use another network runner',
          },
        ),
      );

      await expect(searchDuckDuckGo('test query', 5)).rejects.toMatchObject({
        failureType,
      });
      expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
    },
  );
});
