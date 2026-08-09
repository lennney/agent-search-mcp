import { createHash } from 'node:crypto';

const PRICING_SOURCE = 'https://openai.com/api/pricing/';
const SNAPSHOT_DATE = '2026-08-07';

export const COMPETITIVE_AI_PROFILES = Object.freeze({
  'judge-a': Object.freeze({
    reviewerSlot: 'judge-a',
    provider: 'openai',
    model: 'gpt-4.1-2025-04-14',
    modelFamily: 'gpt-4.1',
    temperature: 0,
    maxOutputTokens: 384,
    maxCostUsd: 12,
    pricing: Object.freeze({
      snapshot_date: SNAPSHOT_DATE,
      source: PRICING_SOURCE,
      currency: 'USD',
      input_per_million_tokens: 2,
      output_per_million_tokens: 8,
    }),
  }),
  'judge-b': Object.freeze({
    reviewerSlot: 'judge-b',
    provider: 'openai',
    model: 'gpt-4o-mini-2024-07-18',
    modelFamily: 'gpt-4o-mini',
    temperature: 0,
    maxOutputTokens: 384,
    maxCostUsd: 3,
    pricing: Object.freeze({
      snapshot_date: SNAPSHOT_DATE,
      source: PRICING_SOURCE,
      currency: 'USD',
      input_per_million_tokens: 0.15,
      output_per_million_tokens: 0.6,
    }),
  }),
  adjudicator: Object.freeze({
    reviewerSlot: 'adjudicator',
    provider: 'openai',
    model: 'gpt-4o-2024-11-20',
    modelFamily: 'gpt-4o',
    temperature: 0,
    maxOutputTokens: 384,
    maxCostUsd: 15,
    pricing: Object.freeze({
      snapshot_date: SNAPSHOT_DATE,
      source: PRICING_SOURCE,
      currency: 'USD',
      input_per_million_tokens: 2.5,
      output_per_million_tokens: 10,
    }),
  }),
});

export function competitiveAiProfile(name) {
  const profile = COMPETITIVE_AI_PROFILES[name];
  if (!profile) throw new Error(`Unknown competitive AI profile: ${name}`);
  return structuredClone(profile);
}

export function competitiveAiPolicySha256() {
  return createHash('sha256')
    .update(JSON.stringify(COMPETITIVE_AI_PROFILES))
    .digest('hex');
}
