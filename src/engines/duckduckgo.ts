import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { SearchResult } from '../types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = resolve(__dirname, '../../scripts/ddg-search.py');

export const duckduckgoProvider = {
  id: 'duckduckgo' as const,
  name: 'DuckDuckGo',
  isFree: true,
  languages: ['en'],
};

// Find python3 that has `ddgs` module available.
// Tries PATH python3 first, then common hardcoded paths.
function findPython(): string {
  const candidates = ['python3', '/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3'];
  const testScript = 'from ddgs import DDGS; print("ok")';
  for (const p of candidates) {
    try {
      execFileSync(p, ['-c', testScript], { timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
