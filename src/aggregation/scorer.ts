import { SearchResult } from '../types.js';

export interface ScoredResult extends SearchResult {
  confidence: number;
  score: number;
}

/**
 * Enhanced scoring with token-based ranking.
 * From ddgs SimpleFilterRanker: classify results into buckets.
 */
export function scoreAndRank(
  results: SearchResult[],
  query: string,
  weights: Record<string, number> = {},
  frequencies?: Map<string, number>
): ScoredResult[] {
  const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length >= 3);
  
  return results
    .map(r => {
      const normalizedUrl = normalizeUrl(r.url);
      const freq = frequencies?.get(normalizedUrl) || 1;
      
      return {
        ...r,
        confidence: r.engines?.length || 1,
        score: calculateScore(r, tokens, weights, freq),
      };
    })
    .sort((a, b) => {
      // 1. Primary: confidence (more engines = higher)
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // 2. Secondary: score
      return b.score - a.score;
    });
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Token-based scoring inspired by ddgs SimpleFilterRanker.
 * 
 * Buckets:
 * - Wikipedia boost: +0.15
 * - Both title+body match: +0.4
 * - Title only match: +0.3
 * - Body only match: +0.2
 * - Neither: 0
 * 
 * Then multiply by frequency bonus and engine weight.
 */
function calculateScore(
  result: SearchResult,
  tokens: string[],
  weights: Record<string, number>,
  frequency: number
): number {
  if (tokens.length === 0) return 0.3;
  
  const titleLower = result.title.toLowerCase();
  const bodyLower = (result.snippet || '').toLowerCase();
  
  // Count token matches
  const titleMatches = tokens.filter(t => titleLower.includes(t)).length;
  const bodyMatches = tokens.filter(t => bodyLower.includes(t)).length;
  
  // Bucket classification
  let bucketScore = 0;
  const hasTitle = titleMatches > 0;
  const hasBody = bodyMatches > 0;
  
  if (hasTitle && hasBody) {
    bucketScore = 0.4; // Both match
  } else if (hasTitle) {
    bucketScore = 0.3; // Title only
  } else if (hasBody) {
    bucketScore = 0.2; // Body only
  }
  
  // Wikipedia boost
  if (result.url.includes('wikipedia.org')) {
    bucketScore += 0.15;
  }
  
  // GitHub boost (high quality for code queries)
  if (result.url.includes('github.com')) {
    bucketScore += 0.05;
  }
  
  // Frequency bonus (from ddgs: more engines = more trustworthy)
  const freqBonus = Math.min(frequency * 0.1, 0.3); // Cap at 0.3
  
  // Engine weight
  const maxWeight = Math.max(
    ...(result.engines || [result.source]).map(e => weights[e] || 0.5)
  );
  
  // Final score: base + bucket + frequency, then apply weight
  let score = 0.1 + bucketScore + freqBonus;
  score *= maxWeight;
  
  return Math.min(score, 1.0);
}
