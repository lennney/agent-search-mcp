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
  const includeDomains = normalizeDomainFilters(policy.includeDomains);
  const excludeDomains = normalizeDomainFilters(policy.excludeDomains);
  const includeFilterRequested = (policy.includeDomains?.length ?? 0) > 0;

  return {
    evaluate(rawResults: SearchResult[]): SearchEvidenceEvaluation {
      const filtered = filterLowQuality(rawResults);
      const domainFiltered = filtered.filter((result) => {
        const hostname = getHostname(result.url);
        if (includeFilterRequested) {
          if (!hostname || !matchesAnyDomain(hostname, includeDomains)) {
            return false;
          }
        }
        if (hostname && matchesAnyDomain(hostname, excludeDomains)) return false;
        return true;
      });
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

function normalizeDomainFilters(domains?: readonly string[]): string[] {
  if (!domains) return [];
  const normalized = domains
    .map(normalizeDomainFilter)
    .filter((domain): domain is string => domain !== undefined);
  return [...new Set(normalized)];
}

function normalizeDomainFilter(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, '');
  if (!trimmed) return undefined;

  try {
    const candidate = trimmed.includes('://')
      ? trimmed
      : `https://${trimmed}`;
    return new URL(candidate).hostname.replace(/^\.+|\.+$/g, '') || undefined;
  } catch {
    return undefined;
  }
}

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return undefined;
  }
}

function matchesAnyDomain(hostname: string, domains: readonly string[]): boolean {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}
