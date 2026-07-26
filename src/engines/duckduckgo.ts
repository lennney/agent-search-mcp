import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { SearchResult, type EngineSearchOptions } from '../types.js';
import { logger } from '../infrastructure/logger.js';
import { searchDuckDuckGoHtml, searchDuckDuckGoNewsHtml } from './duckduckgo-html.js';
import { searchDuckDuckGoWeb } from './duckduckgo-web.js';
import { isEngineAdapterError } from './engine-error.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-search.py');
const NEWS_SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-news-search.py');

// Python paths to check for ddgs availability, ordered by reliability.
const PYTHON_CANDIDATES = (() => {
  const home = process.env.HOME || '';
  const pipxDir = `${home}/.local/pipx/venvs/ddgs`;
  const pipxPython = existsSync(pipxDir) ? `${pipxDir}/bin/python3` : null;
  return [
    ...(pipxPython ? [pipxPython] : []),
    'python3',
    'python',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/opt/homebrew/opt/python@3.14/bin/python3.14',
  ];
})();

export const duckduckgoProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo',
  isFree: true,
  languages: ['en'],
};

// ─── Lazy Python detection (cached) ──────────────────────────────────────

let _pythonBin: string | null = null;
let _ddgsChecked = false;

/**
 * Probe Python candidates for ddgs availability. Called at most once;
 * result is cached in _pythonBin.
 */
function detectPythonBin(): string | null {
  const testScript = 'import ddgs; print(ddgs.__version__)';
  for (const p of PYTHON_CANDIDATES) {
    try {
      const out = execFileSync(p, ['-c', testScript], {
        timeout: 3000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      logger.info({ python: p, version: out.trim() }, 'DDG: Using Python backend');
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Get the cached Python binary path (or null if ddgs not available).
 * Detection runs only once per process lifetime.
 */
function getPythonBin(): string | null {
  if (_ddgsChecked) return _pythonBin;
  _ddgsChecked = true;
  _pythonBin = detectPythonBin();
  if (!_pythonBin) {
    logger.info('DDG: Python/ddgs not available — using native Node representations');
  }
  return _pythonBin;
}

/**
 * Check whether the ddgs Python library is available.
 * Triggers lazy detection on first call; subsequent calls use cached result.
 */
export function isDdgsAvailable(): boolean {
  return getPythonBin() !== null;
}

/**
 * Get the Python binary path for internal use. Returns null if unavailable.
 */
function getPythonBinOrNull(): string | null {
  return getPythonBin();
}

// ─── Search functions ────────────────────────────────────────────────────

/**
 * Search DuckDuckGo using the optional Python library, then native Node
 * representations. The Web preload API is preferred over no-JS HTML/Lite
 * because DDG issues it for the current query and request identity.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  options?.signal?.throwIfAborted();
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    return searchNativeRepresentations(query, limit, options);
  }
  try {
    const output = execFileSync(
      pythonBin,
      [SCRIPT_PATH, query, String(limit)],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const results = JSON.parse(output.trim());
    if (!Array.isArray(results) || results.length === 0) {
      logger.warn('DDG Python search returned no results; trying native Node representations');
      return searchNativeRepresentations(query, limit, options);
    }
    options?.signal?.throwIfAborted();
    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source || 'duckduckgo',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    options?.signal?.throwIfAborted();
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT')) {
      logger.warn({ python: pythonBin, script: SCRIPT_PATH }, 'DDG: Python binary not found, trying native representations');
    } else if (msg.includes('timeout')) {
      logger.warn('DDG: Python search timed out, trying native representations');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG Python search failed, trying native representations');
    }
    return searchNativeRepresentations(query, limit, options);
  }
}

async function searchNativeRepresentations(
  query: string,
  limit: number,
  options?: EngineSearchOptions,
): Promise<SearchResult[]> {
  options?.signal?.throwIfAborted();
  try {
    const results = await searchDuckDuckGoWeb(query, limit, {
      ...(options ?? {}),
      throwOnError: true,
    });
    if (results.length > 0) return results;
    logger.info('DDG Web representation returned no results; trying HTML/Lite');
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (isEngineAdapterError(error) && error.failureType === 'bot_challenge') {
      throw error;
    }
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'DDG Web representation failed; trying HTML/Lite',
    );
  }

  return options
    ? searchDuckDuckGoHtml(query, limit, options)
    : searchDuckDuckGoHtml(query, limit);
}

/**
 * Search DuckDuckGo News using ddgs Python library.
 * Returns empty array if Python/ddgs not available (no HTML news fallback yet).
 */
export async function searchDuckduckgoNews(query: string, limit: number = 10, timeRange: string = 'w'): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    logger.info('DDG News: Python/ddgs not available, falling back to HTML engine');
    return searchDuckDuckGoNewsHtml(query, limit);
  }
  const timeMap: Record<string, string> = { day: 'd', week: 'w', month: 'm' };
  const timelimit = timeMap[timeRange] || 'w';

  try {
    const output = execFileSync(
      pythonBin,
      [NEWS_SCRIPT_PATH, query, String(limit), timelimit],
      {
        timeout: 15000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const entries = JSON.parse(output.trim());
    return entries.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source_name || 'duckduckgo-news',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ err: msg.slice(0, 200) }, 'DDG News search failed, falling back to HTML engine');
    return searchDuckDuckGoNewsHtml(query, limit);
  }
}
