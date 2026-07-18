import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { SearchResult } from '../types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-search.py');
const NEWS_SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-news-search.py');

// Python paths to check for ddgs availability, ordered by reliability.
// pipx venv is preferred (has latest ddgs); PATH and common locations are fallbacks.
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

/**
 * Find python3 that has `ddgs` module available.
 * Tries pipx venv first (most reliable), then PATH python3, then common hardcoded paths.
 */
function findPython(): string {
  const testScript = 'import ddgs; print(ddgs.__version__)';
  for (const p of PYTHON_CANDIDATES) {
    try {
      const out = execFileSync(p, ['-c', testScript], { timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      console.error(`DDG: Using python=${p} (ddgs v${out.trim()})`);
      return p;
    } catch {
      continue;
    }
  }
  return 'python3'; // last resort, let execFileSync throw a clearer error
}

/**
 * Search DuckDuckGo using ddgs Python library (bypasses anti-bot).
 * Falls back to empty array if Python/ddgs not available.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  const pythonBin = findPython();
  try {
    // Use execFileSync to avoid shell injection (query passed as argument, not shell-interpolated)
    const output = execFileSync(
      pythonBin,
      [SCRIPT_PATH, query, String(limit)],
      {
        timeout: 15000,  // 15s timeout
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
    // Python/ddgs not available or timed out
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ENOENT')) {
      console.error(`DDG: ${pythonBin} not found, skipping`);
      console.error(`DDG: script path = ${SCRIPT_PATH}`);
    } else if (msg.includes('timeout')) {
      console.error('DDG: Search timed out');
    } else if (msg.includes('python3') || msg.includes('Python')) {
      console.error(`DDG: Python error:`, msg.slice(0, 200));
    } else {
      console.error('DDG search failed:', msg.slice(0, 200));
    }
    return [];
  }
}

/**
 * Search DuckDuckGo News using ddgs Python library.
 * Falls back to empty array if Python/ddgs not available.
 */
export async function searchDuckduckgoNews(query: string, limit: number = 10, timeRange: string = 'w'): Promise<SearchResult[]> {
  const pythonBin = findPython();
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
    console.error('DDG News search failed:', msg.slice(0, 200));
    return [];
  }
}
