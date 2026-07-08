import { SearchResult } from '../types.js';

// 域名权威评级: 域名 → 评分加成
// 基于 TLD + 域名知名度
const DOMAIN_AUTHORITY: Record<string, number> = {
  // .edu / .gov 高权威
  ".edu": 0.12,
  ".gov": 0.12,
  ".ac.": 0.10,
  // 知名技术站
  "wikipedia.org": 0.15,
  "github.com": 0.08,
  "stackoverflow.com": 0.10,
  "stackexchange.com": 0.08,
  "arxiv.org": 0.12,
  "scholar.google.com": 0.10,
  "medium.com": 0.02,
  "dev.to": 0.05,
  "news.ycombinator.com": 0.08,
  // 低质量/采集站 (负加成)
  "blogspot.com": -0.03,
  "wordpress.com": -0.02,
};

/**
 * 从 URL 提取域名权威加成。
 * 先匹配知名域名, 再按 TLD 降级匹配。
 */
function getDomainBoost(url: string): number {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // 1. 精确匹配知名域名
    for (const [domain, boost] of Object.entries(DOMAIN_AUTHORITY)) {
      if (hostname === domain || hostname.endsWith("." + domain)) {
        return boost;
      }
    }
    
    // 2. TLD 匹配 (.edu / .gov / .ac.xx)
    if (hostname.endsWith(".edu")) return DOMAIN_AUTHORITY[".edu"];
    if (hostname.endsWith(".gov")) return DOMAIN_AUTHORITY[".gov"];
    // .ac.uk, .ac.jp, .ac.cn 等学术域名
    if (hostname.includes(".ac.")) return DOMAIN_AUTHORITY[".ac."];
    
    return 0;
  } catch {
    return 0;
  }
}

export interface ScoredResult extends SearchResult {
  confidence: number;
  score: number;
}

/**
 * Enhanced scoring with token-based ranking and weighted confidence.
 * From ddgs SimpleFilterRanker: classify results into buckets.
 */
export function scoreAndRank(
  results: SearchResult[],
  query: string,
  weights: Record<string, number> = {},
  frequencies?: Map<string, number>
): ScoredResult[] {
  const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length >= 3);
  
  // Calculate max possible weight for normalization
  const maxWeightSum = Math.max(...Object.values(weights), 0.5) * Math.max(tokens.length, 1);
  
  return results
    .map(r => {
      const normalizedUrl = normalizeUrl(r.url);
      const freq = frequencies?.get(normalizedUrl) || 1;
      
      return {
        ...r,
        confidence: calculateWeightedConfidence(r, weights, maxWeightSum),
        score: calculateScore(r, tokens, weights, freq),
      };
    })
    .sort((a, b) => {
      // 1. Primary: confidence (weighted quality signal)
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      // 2. Secondary: score
      return b.score - a.score;
    });
}

/**
 * Calculate weighted confidence score (0-1) based on engine weights.
 * Instead of raw engine count, uses sum of weights / max possible weight.
 * 
 * Example: Brave (0.95) + Exa (0.92) = (0.95+0.92)/max_possible
 *          vs Sogou (0.80) + Baidu (0.75) = (0.80+0.75)/max_possible
 * The first pair gets higher confidence.
 */
function calculateWeightedConfidence(
  result: SearchResult,
  weights: Record<string, number>,
  maxWeightSum: number
): number {
  const engines = result.engines || [];
  if (engines.length === 0) {
    // No engine info, use source weight as fallback
    const sourceWeight = weights[result.source] || 0.5;
    return sourceWeight * 0.5; // Lower confidence for unknown source
  }
  
  // Sum weights for engines that returned this result
  const weightSum = engines.reduce((sum, engine) => {
    return sum + (weights[engine] || 0.5);
  }, 0);
  
  // Normalize: divide by max possible weight sum (considering count)
  const normalizedConfidence = Math.min(weightSum / (maxWeightSum * engines.length), 1.0);
  
  // Apply count bonus (more engines still matters, but with diminishing returns)
  const countBonus = Math.min(engines.length * 0.1, 0.3);
  
  return Math.min(normalizedConfidence + countBonus, 1.0);
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
  
  // 域名权威加成 (替代原来硬编码的 wikipedia/github boost)
  const domainBoost = getDomainBoost(result.url);
  if (domainBoost !== 0) {
    bucketScore += domainBoost;
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

export interface ConfidenceBasketOptions {
  minResults?: number;
  minAvgConfidence?: number;
  topK?: number;
}

export interface ConfidenceBasketResult {
  sufficient: boolean;
  basketConfidence: number;
  topResultsCount: number;
  analyzedCount: number;
}

export function checkConfidenceBasket(
  results: ScoredResult[],
  options?: ConfidenceBasketOptions
): ConfidenceBasketResult {
  const minResults = options?.minResults ?? 3;
  const minAvgConfidence = options?.minAvgConfidence ?? 0.6;
  const topK = options?.topK ?? 5;

  if (results.length === 0) {
    return { sufficient: false, basketConfidence: 0, topResultsCount: 0, analyzedCount: 0 };
  }

  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const top = sorted.slice(0, topK);
  const avgConfidence = top.reduce((sum, r) => sum + r.confidence, 0) / top.length;
  const basketConfidence = Math.round(avgConfidence * 100) / 100;

  return {
    sufficient: top.length >= minResults && basketConfidence >= minAvgConfidence,
    basketConfidence,
    topResultsCount: top.length,
    analyzedCount: results.length,
  };
}
