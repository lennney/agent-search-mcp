import { SearchResult } from '../types.js';

export interface ScoredResult extends SearchResult {
  confidence: number;
  score: number;
}

export function scoreAndRank(
  results: SearchResult[],
  query: string,
  weights: Record<string, number> = {}
): ScoredResult[] {
  return results
    .map(r => ({
      ...r,
      confidence: r.engines?.length || 1,
      score: calculateScore(r, query, weights),
    }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.score - a.score;
    });
}

function calculateScore(
  result: SearchResult,
  query: string,
  weights: Record<string, number>
): number {
  let s = 0.3;
  if (result.title.toLowerCase().includes(query.toLowerCase())) {
    s += 0.3;
  }
  if ((result.engines?.length || 0) > 1) {
    s += Math.log2(result.engines!.length) * 0.2;
  }
  const maxWeight = Math.max(
    ...(result.engines || [result.source]).map(e => weights[e] || 0.5)
  );
  s *= maxWeight;
  return Math.min(s, 1.0);
}
