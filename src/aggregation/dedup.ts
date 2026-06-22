import { SearchResult } from '../types.js';

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function dedupByUrl(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();
  for (const r of results) {
    const key = normalizeUrl(r.url);
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

export function dedupByTitle(results: SearchResult[], threshold = 0.85): SearchResult[] {
  const kept: SearchResult[] = [];
  for (const r of results) {
    const isDuplicate = kept.some(k => jaccard(k.title, r.title) > threshold);
    if (!isDuplicate) kept.push(r);
  }
  return kept;
}

function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
