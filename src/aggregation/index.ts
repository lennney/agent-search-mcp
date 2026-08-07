export {
  dedupByProvider,
  dedupByUrl,
  dedupByTitle,
  filterLowQuality,
  getProviderFamily,
  getResultEngines,
  normalizeUrl,
  PROVIDER_FAMILIES,
} from './dedup.js';
export { scoreAndRank } from './scorer.js';
export { checkConfidenceBasket } from './scorer.js';
export type { ScoredResult, ConfidenceBasketResult, ConfidenceBasketOptions } from './scorer.js';
export { createSearchEvidenceEvaluator } from './search-evidence.js';
export type {
  SearchEvidenceEvaluation,
  SearchEvidenceEvaluator,
  SearchEvidencePolicy,
} from './search-evidence.js';
export {
  ACTIVE_URL_CANONICALIZATION_VERSION,
  canonicalizeUrl,
} from './url-canonicalization.js';
export type { UrlCanonicalizationVersion } from './url-canonicalization.js';
export { formatResults } from './format.js';
export type { FormatOptions } from './format.js';
export { selectRelevantPassage } from './passage-selector.js';
export type { PassageSelection } from './passage-selector.js';
export { expandQuery } from './query-expander.js';
export { hasChinese, toTraditional, toSimplified, generateChineseVariants } from './chinese-optimizer.js';
export { enrichResults } from './enricher.js';
export type { EnrichOptions, EnrichResult } from './enricher.js';
export { detectLanguage } from './language-detector.js';
export type { DetectedLanguage } from './language-detector.js';
export { classifyQuery, QUERY_CLASSIFIER_VERSION } from './query-classifier.js';
export type {
  QueryClassification,
  QueryFreshness,
  QueryIntent,
} from './query-classifier.js';
export { semanticDedup, semanticRerank, isSemanticAvailable } from './semantic.js';
export type { SemanticOptions } from './semantic.js';
