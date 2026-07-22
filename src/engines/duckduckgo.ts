import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { SearchResult } from '../types.js';
import { logger } from '../infrastructure/logger.js';
import { searchDuckDuckGoHtml } from './duckduckgo-html.js';

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
    logger.warn('DDG: Python/ddgs not available — DuckDuckGo engine will return empty results');
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
 * Search DuckDuckGo using ddgs Python library (bypasses anti-bot).
 * Falls back to Node.js HTML engine if Python/ddgs not available.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    // Python/ddgs not available — use Node.js HTML fallback
    logger.info('DDG: Falling back to Node.js HTML engine');
    return searchDuckDuckGoHtml(query, limit);
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
    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || '',
      source: r.source || 'duckduckgo',
      engines: ['duckduckgo'],
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT')) {
      logger.warn({ python: pythonBin, script: SCRIPT_PATH }, 'DDG: Python binary not found, falling back to HTML engine');
    } else if (msg.includes('timeout')) {
      logger.warn('DDG: Python search timed out, falling back to HTML engine');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'DDG Python search failed, falling back to HTML engine');
    }
    // Fall back to HTML engine on Python errors
    return searchDuckDuckGoHtml(query, limit);
  }
}

/**
 * Search DuckDuckGo News using ddgs Python library.
 * Returns empty array if Python/ddgs not available (no HTML news fallback yet).
 */
export async function searchDuckduckgoNews(query: string, limit: number = 10, timeRange: string = 'w'): Promise<SearchResult[]> {
  const pythonBin = getPythonBinOrNull();
  if (!pythonBin) {
    logger.info('DDG News: Python/ddgs not available, skipping (no HTML fallback for news)');
    return [];
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
    logger.warn({ err: msg.slice(0, 200) }, 'DDG News search failed');
    return [];
  }
}
