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

import { execFileSync } from 'child_process';

describe('DDG Python → HTML fallback', () => {
  // Re-import in each test to reset the lazy cache (_ddgsChecked, _pythonBin)
  let searchDuckDuckGo: typeof import('../../src/engines/duckduckgo.js').searchDuckDuckGo;
  let searchDuckDuckGoHtml: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import to get fresh module with reset lazy cache
    const ddgMod = await import('../../src/engines/duckduckgo.js');
    searchDuckDuckGo = ddgMod.searchDuckDuckGo;

    const htmlMod = await import('../../src/engines/duckduckgo-html.js');
    searchDuckDuckGoHtml = htmlMod.searchDuckDuckGoHtml as ReturnType<typeof vi.fn>;
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
    expect(searchDuckDuckGoHtml).not.toHaveBeenCalled();
  });

  it('falls back to HTML engine when ddgs is not available', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('ModuleNotFoundError: No module named ddgs');
    });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });

  it('falls back to HTML engine when Python search throws', async () => {
    // ddgs version check passes, search script throws
    vi.mocked(execFileSync)
      .mockReturnValueOnce('5.0.0\n')
      .mockImplementationOnce(() => {
        throw new Error('Python script error');
      });

    const results = await searchDuckDuckGo('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('HTML Fallback Result');
    expect(searchDuckDuckGoHtml).toHaveBeenCalledWith('test query', 5);
  });
});
