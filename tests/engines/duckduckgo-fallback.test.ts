import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

// Mock the HTML fallback engine
vi.mock('../../src/engines/duckduckgo-html.js', () => ({
  searchDuckDuckGoHtml: vi.fn(async () => [
    { title: 'HTML Fallback Result', url: 'https://html.ex/1', snippet: 'from HTML', source: 'duckduckgo', engines: ['duckduckgo'] },
  ]),
  duckduckgoHtmlProvider: { id: 'duckduckgo', name: 'DuckDuckGo (HTML)', isFree: true, languages: ['en'] },
}));

vi.mock('../../src/engines/duckduckgo-web.js', () => ({
  searchDuckDuckGoWeb: vi.fn(async () => [
    { title: 'Web Result', url: 'https://web.ex/1', snippet: 'from Web', source: 'duckduckgo', engines: ['duckduckgo'] },
  ]),
}));

import { execFileSync } from 'child_process';
import { EngineAdapterError } from '../../src/engines/engine-error.js';

describe('DDG Python → Web → HTML fallback', () => {
  // Re-import in each test to reset the lazy cache (_ddgsChecked, _pythonBin)
  let searchDuckDuckGo: typeof import('../../src/engines/duckduckgo.js').searchDuckDuckGo;
  let searchDuckDuckGoHtml: ReturnType<typeof vi.fn>;
  let searchDuckDuckGoWeb: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import to get fresh module with reset lazy cache
    const ddgMod = await import('../../src/engines/duckduckgo.js');
    searchDuckDuckGo = ddgMod.searchDuckDuckGo;

    const htmlMod = await import('../../src/engines/duckduckgo-html.js');
    searchDuckDuckGoHtml = htmlMod.searchDuckDuckGoHtml as ReturnType<typeof vi.fn>;
    const webMod = await import('../../src/engines/duckduckgo-web.js');
    searchDuckDuckGoWeb = webMod.searchDuckDuckGoWeb as ReturnType<typeof vi.fn>;
  });

  it('uses Python path when ddgs is available', async () => {
    vi.mocked(execFileSync).mockImplementation((_bin: string, args: string[]) => {
      // The first call is the ddgs version check
      if (args[0] === '-c') return '5.0.0\n';
      // Subsequent calls are search script invocations
      return JSON.stringify([{ title: 'Python Result', url: 'https://py.ex/1', snippet: 'from Python', source: 'duckduckgo' }]);
    });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Python Result');
    expect(searchDuckDuckGoWeb).not.toHaveBeenCalled();
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('uses the Web representation when ddgs is not available', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Web Result');
    expect(searchDuckDuckGoWeb).toHaveBeenCalledWith('test query', 5, {
      throwOnError: true,
    });
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('uses the Web representation when Python search throws', async () => {
    // ddgs version check passes, search script throws
    vi.mocked(execFileSync)
      .mockReturnValueOnce('5.0.0\n')
      .mockImplementationOnce(() => {
        throw new Error('Python script error');
      });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Web Result');
    expect(searchDuckDuckGoWeb).toHaveBeenCalled();
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('falls through to HTML when the Web representation fails', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });
    searchDuckDuckGoWeb.mockRejectedValueOnce(
      new Error('DuckDuckGo Web unavailable'),
    );

    const results = await searchDuckDuckGo('test query', 5);

    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });

  it('does not switch representations after a Web bot challenge', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });
    searchDuckDuckGoWeb.mockRejectedValueOnce(new EngineAdapterError(
      'bot_challenge',
      'DuckDuckGo Web returned an anti-bot challenge',
      {
        retryable: false,
        cooldownMs: 3_600_000,
        suggestion: 'Use another network runner',
      },
    ));

    await expect(searchDuckDuckGo('test query', 5)).rejects.toMatchObject({
      failureType: 'bot_challenge',
    });
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('does not accept an empty Python response as a successful search', async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('5.0.0\n')
      .mockReturnValueOnce('[]');

    const results = await searchDuckDuckGo('test query', 5);

    expect(results[0].title).toBe('Web Result');
    expect(searchDuckDuckGoWeb).toHaveBeenCalled();
  });
});
