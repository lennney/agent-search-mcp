import { createResultScope } from './result-scope.js';
import type { SearchResult } from '../types.js';
import { dedupByTitle, dedupByUrl, filterLowQuality } from './dedup.js';
import {
  checkConfidenceBasket,
  scoreAndRank,
  type ConfidenceBasketOptions,
  type ConfidenceBasketResult,
  type ScoredResult,
} from './scorer.js';

export interface SearchEvidencePolicy {
  query: string;
  engineWeights?: Record<string, number>;
  minConfidence?: number;
  minSourceCount?: number;
  includeDomains?: readonly string[];
  excludeDomains?: readonly string[];
  qualityGate?: ConfidenceBasketOptions;
}

export interface SearchEvidenceEvaluation {
  results: ScoredResult[];
  qualityGate: ConfidenceBasketResult;
}

export interface SearchEvidenceEvaluator {
  evaluate(rawResults: SearchResult[]): SearchEvidenceEvaluation;
  assess(results: ScoredResult[]): ConfidenceBasketResult;
}

/**
 * Create one evidence evaluator per search request. Normalization and quality
 * assessment share the same immutable policy, including post-semantic checks.
 */
export function createSearchEvidenceEvaluator(
  policy: SearchEvidencePolicy,
): SearchEvidenceEvaluator {
  const inScope = createResultScope(policy.includeDomains, policy.excludeDomains);

  return {
    evaluate(rawResults: SearchResult[]): SearchEvidenceEvaluation {
      const domainFiltered = filterLowQuality(rawResults.filter(result => inScope(result.url)));
      const { results: urlDeduped, frequencies } = dedupByUrl(domainFiltered);
      const ranked = scoreAndRank(
        dedupByTitle(urlDeduped),
        policy.query,
        policy.engineWeights,
        frequencies,
      );
      const results = ranked.filter((result) => {
        if (result.confidence < (policy.minConfidence ?? 0)) return false;
        if (result.source_count < (policy.minSourceCount ?? 1)) return false;
        return true;
      });

      return {
        results,
        qualityGate: checkConfidenceBasket(results, policy.qualityGate),
      };
    },
    assess(results: ScoredResult[]): ConfidenceBasketResult {
      return checkConfidenceBasket(results, policy.qualityGate);
    },
  };
}
