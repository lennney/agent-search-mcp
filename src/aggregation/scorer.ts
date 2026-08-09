import { SearchResult } from '../types.js';
import { getProviderFamily, getResultEngines, normalizeUrl } from './dedup.js';
import { extractQueryTerms, termMatches } from './passage-selector.js';

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
  // 中文权威站点
  "baike.baidu.com": 0.15,
  "zhihu.com": 0.10,
  "csdn.net": 0.05,
  "cnblogs.com": 0.05,
  "segmentfault.com": 0.05,
  "infoq.cn": 0.05,
  "jianshu.com": 0.03,
  "oschina.net": 0.03,
  "sspai.com": 0.03,
  "36kr.com": 0.03,
  "huxiu.com": 0.03,
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
    if (hostname.endsWith(".edu.cn")) return 0.12;
    if (hostname.endsWith(".gov.cn")) return 0.12;
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
  /** Source-reliability confidence, independent of query relevance (0-1). */
  confidence: number;
  /** Query relevance score (0-1). */
  relevance: number;
  /** Number of independent upstream provider families that returned this result. */
  source_count: number;
  /** @deprecated Use relevance. Retained for backward compatibility. */
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
  const tokens = extractQueryTerms(query);
  
  return results
    .map(r => {
      const normalizedUrl = normalizeUrl(r.url);
      const freq = frequencies?.get(normalizedUrl) || 1;
      const engines = getResultEngines(r);
      const sourceCount = Math.max(
        new Set(engines.map(getProviderFamily)).size,
        1,
      );
      const relevance = calculateRelevance(r, tokens, weights, freq);
      
      return {
        ...r,
        engines,
        confidence: calculateWeightedConfidence(r, weights, sourceCount),
        relevance,
        source_count: sourceCount,
        score: relevance,
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
 * Calculate confidence (0-1) from source reliability and corroboration only.
 * Query-token matches intentionally do not affect this signal.
 * 
 * Example: Brave (0.95) + Exa (0.92) = (0.95+0.92)/max_possible
 *          vs Sogou (0.80) + Baidu (0.75) = (0.80+0.75)/max_possible
 * The first pair gets higher confidence.
 */
function calculateWeightedConfidence(
  result: SearchResult,
  weights: Record<string, number>,
  sourceCount: number
): number {
  const engines = getResultEngines(result);
  if (engines.length === 0) {
    return 0.5;
  }

  const familyWeights = new Map<string, number>();
  for (const engine of engines) {
    const family = getProviderFamily(engine);
    familyWeights.set(
      family,
      Math.max(familyWeights.get(family) ?? 0, weights[engine] || 0.5),
    );
  }
  const reliability =
    [...familyWeights.values()].reduce((sum, weight) => sum + weight, 0)
    / familyWeights.size;
  const corroborationBonus = Math.min(Math.max(sourceCount - 1, 0) * 0.08, 0.2);
  return Math.min(reliability + corroborationBonus, 1.0);
}

/**
 * Token-based scoring inspired by ddgs SimpleFilterRanker.
 * 
 * Query coverage:
 * - Title term coverage contributes up to +0.35.
 * - Body term coverage contributes up to +0.20.
 * - Matching both surfaces contributes an additional +0.05.
 * 
 * Then multiply by frequency bonus and engine weight.
 */
function calculateRelevance(
  result: SearchResult,
  tokens: string[],
  weights: Record<string, number>,
  frequency: number
): number {
  if (tokens.length === 0) return 0.3;
  
  const titleLower = result.title.toLowerCase();
  const bodyLower = (result.snippet || '').toLowerCase();
  
  // Count token matches at word boundaries (Latin) / contiguous bigrams (CJK)
  const titleMatches = tokens.filter(t => termMatches(titleLower, t)).length;
  const bodyMatches = tokens.filter(t => termMatches(bodyLower, t)).length;
  
  const titleCoverage = titleMatches / tokens.length;
  const bodyCoverage = bodyMatches / tokens.length;
  const crossSurfaceBonus = titleMatches > 0 && bodyMatches > 0 ? 0.05 : 0;
  let bucketScore = titleCoverage * 0.35 + bodyCoverage * 0.2 + crossSurfaceBonus;
  
  // 域名权威加成 (替代原来硬编码的 wikipedia/github boost)
  const domainBoost = getDomainBoost(result.url);
  if (domainBoost !== 0) {
    bucketScore += domainBoost;
  }
  
  // Frequency bonus (from ddgs: more engines = more trustworthy)
  const freqBonus = Math.min(frequency * 0.1, 0.3); // Cap at 0.3
  
  // Engine weight
  const resultEngines = getResultEngines(result);
  const maxWeight = resultEngines.length > 0
    ? Math.max(...resultEngines.map(e => weights[e] || 0.5))
    : 0.5;
  
  // Final score: base + bucket + frequency, then apply weight
  let score = 0.1 + bucketScore + freqBonus;
  score *= maxWeight;
  
  return Math.min(score, 1.0);
}

export interface ConfidenceBasketOptions {
  minResults?: number;
  minAvgConfidence?: number;
  /** Minimum number of individually relevant results in the Top-K basket. */
  minRelevantResults?: number;
  /** Per-result query-relevance gate. Default: 0.35 (provisional). */
  minResultRelevance?: number;
  /** Minimum independent upstream provider families represented in Top-K. */
  minProviderFamilies?: number;
  topK?: number;
}

export interface ConfidenceBasketResult {
  sufficient: boolean;
  basketConfidence: number;
  /** Diagnostic mean; the stopping decision uses relevantResultsCount. */
  basketRelevance: number;
  relevantResultsCount: number;
  relevanceThreshold: number;
  providerFamilyCount: number;
  topResultsCount: number;
  analyzedCount: number;
}

// This is an internal, deliberately conservative heuristic rather than a
// calibrated relevance probability. Real pooled qrels must calibrate it before
// it can support a public quality claim.
const DEFAULT_RESULT_RELEVANCE_GATE = 0.35;

/**
 * Decide whether a confidence-ranked result basket has enough independent
 * source-quality and query-relevance evidence to stop a waterfall search.
 */
export function checkConfidenceBasket(
  results: ScoredResult[],
  options?: ConfidenceBasketOptions
): ConfidenceBasketResult {
  const minResults = options?.minResults ?? 3;
  const minAvgConfidence = options?.minAvgConfidence ?? 0.6;
  const minRelevantResults = options?.minRelevantResults ?? minResults;
  const minResultRelevance =
    options?.minResultRelevance ?? DEFAULT_RESULT_RELEVANCE_GATE;
  const minProviderFamilies = options?.minProviderFamilies ?? 1;
  const topK = options?.topK ?? 5;

  if (results.length === 0) {
    return {
      sufficient: false,
      basketConfidence: 0,
      basketRelevance: 0,
      relevantResultsCount: 0,
      relevanceThreshold: minResultRelevance,
      providerFamilyCount: 0,
      topResultsCount: 0,
      analyzedCount: 0,
    };
  }

  // Preserve the caller's current candidate order rather than applying a
  // confidence-only sort that could hide relevant lower-ranked candidates.
  const top = results.slice(0, topK);
  const avgConfidence = top.reduce((sum, r) => {
    const confidence = Number.isFinite(r.confidence)
      && r.confidence >= 0
      && r.confidence <= 1
      ? r.confidence
      : 0;
    return sum + confidence;
  }, 0) / top.length;
  const avgRelevance = top.reduce((sum, r) => {
    const relevance = Number.isFinite(r.relevance) && r.relevance >= 0 && r.relevance <= 1
      ? r.relevance
      : 0;
    return sum + relevance;
  }, 0) / top.length;
  const basketConfidence = Math.round(avgConfidence * 100) / 100;
  const basketRelevance = Math.round(avgRelevance * 100) / 100;
  const relevantResultsCount = top.filter((result) => (
    Number.isFinite(result.relevance)
    && result.relevance >= minResultRelevance
    && result.relevance <= 1
  )).length;
  const providerFamilies = new Set<string>();
  for (const result of top) {
    for (const engine of getResultEngines(result)) {
      if (engine) providerFamilies.add(getProviderFamily(engine));
    }
  }
  const providerFamilyCount = providerFamilies.size;

  return {
    sufficient:
      top.length >= minResults
      && basketConfidence >= minAvgConfidence
      && relevantResultsCount >= minRelevantResults
      && providerFamilyCount >= minProviderFamilies,
    basketConfidence,
    basketRelevance,
    relevantResultsCount,
    relevanceThreshold: minResultRelevance,
    providerFamilyCount,
    topResultsCount: top.length,
    analyzedCount: results.length,
  };
}
