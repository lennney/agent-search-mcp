import { readFileSync } from 'node:fs';

const providerFamilyContract = JSON.parse(readFileSync(
  new URL('../../docs/contracts/provider-families-v1.json', import.meta.url),
  'utf8',
));
const PROVIDER_FAMILIES = providerFamilyContract.families;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getProviderFamily(source) {
  return PROVIDER_FAMILIES[source] ?? source;
}

export function countProviderFamilies(sources) {
  return new Set(sources.map(getProviderFamily)).size;
}

export function validateEvidenceHandoff(response) {
  const errors = [];
  if (!isRecord(response)) {
    return { valid: false, errors: ['response must be an object'] };
  }
  if (!Array.isArray(response.results)) {
    return { valid: false, errors: ['results must be an array'] };
  }

  for (const [index, result] of response.results.entries()) {
    const prefix = `results[${index}]`;
    if (!isRecord(result)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof result.title !== 'string' || typeof result.url !== 'string') {
      errors.push(`${prefix} must contain title and url strings`);
    }
    const rawSources = Array.isArray(result.sources) ? result.sources : [];
    const sources = [...new Set(
      rawSources.filter(source => typeof source === 'string' && source),
    )];
    if (sources.length === 0) {
      errors.push(`${prefix}.sources must contain at least one source`);
    }
    if (sources.length !== rawSources.length) {
      errors.push(`${prefix}.sources must contain unique non-empty strings`);
    }

    const providerFamilyCount = countProviderFamilies(sources);
    const sourceCountValid = Number.isInteger(result.source_count)
      && result.source_count === providerFamilyCount;
    if (result.source_count !== undefined && !sourceCountValid) {
      errors.push(`${prefix}.source_count must equal unique provider-family count`);
    }
    if (result.compacted === true) continue;

    if (!isFiniteNumber(result.confidence)
      || result.confidence < 0
      || result.confidence > 1) {
      errors.push(`${prefix}.confidence must be a number from 0 to 1`);
    }
    if (!isFiniteNumber(result.relevance)
      || result.relevance < 0
      || result.relevance > 1) {
      errors.push(`${prefix}.relevance must be a number from 0 to 1`);
    }
    if (result.source_count === undefined) {
      errors.push(`${prefix}.source_count must equal unique provider-family count`);
    }
    if (!isRecord(result.evidence)) {
      errors.push(`${prefix}.evidence is required for a full result`);
      continue;
    }
    const evidence = result.evidence;
    if (!isFiniteNumber(evidence.passage_score) || evidence.passage_score < 0) {
      errors.push(`${prefix}.evidence.passage_score must be non-negative`);
    }
    if (!Array.isArray(evidence.matched_terms)
      || evidence.matched_terms.some(term => typeof term !== 'string')) {
      errors.push(`${prefix}.evidence.matched_terms must be a string array`);
    }
    if (evidence.published_at !== null && typeof evidence.published_at !== 'string') {
      errors.push(`${prefix}.evidence.published_at must be a string or null`);
    }
    if (!['search_snippet', 'reader_extracted'].includes(evidence.extraction)) {
      errors.push(`${prefix}.evidence.extraction is invalid`);
    }
    if (!Number.isInteger(evidence.source_chars) || evidence.source_chars < 0
      || !Number.isInteger(evidence.selected_chars) || evidence.selected_chars < 0) {
      errors.push(`${prefix}.evidence character counts must be non-negative integers`);
    }
  }

  if (response.partialFailures !== undefined && !Array.isArray(response.partialFailures)) {
    errors.push('partialFailures must be an array when present');
  }
  const budget = response.meta?.evidence_budget;
  if (budget !== undefined) {
    if (!isRecord(budget)
      || budget.unit !== 'characters'
      || !Number.isInteger(budget.limit)
      || !Number.isInteger(budget.used)
      || budget.limit < 0
      || budget.used < 0
      || budget.used > budget.limit) {
      errors.push('meta.evidence_budget is invalid');
    }
  }

  return { valid: errors.length === 0, errors };
}
