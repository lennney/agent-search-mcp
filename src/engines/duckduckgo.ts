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

/**
 * Search DuckDuckGo using ddgs Python library (bypasses anti-bot).
 * Falls back to empty array if Python/ddgs not available.
 */
export async function searchDuckDuckGo(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    // Use execFileSync to avoid shell injection (query passed as argument, not shell-interpolated)
    const output = execFileSync(
      '/usr/bin/python3',
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
    if (msg.includes('ENOENT') || msg.includes('python3')) {
      console.error('DDG: Python3 not found, skipping');
    } else if (msg.includes('timeout')) {
      console.error('DDG: Search timed out');
    } else {
      console.error('DDG search failed:', msg.slice(0, 200));
    }
    return [];
  }
}
