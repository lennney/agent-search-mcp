export interface PassageSelection {
  text: string;
  score: number;
  matched_terms: string[];
}

const CJK_SEQUENCE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/gu;
const CJK_ONLY = /^[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+$/u;
const LATIN_TERM = /[\p{L}\p{N}]+/gu;

export function extractQueryTerms(query: string): string[] {
  const normalized = query.toLowerCase();
  const terms = new Set<string>();

  for (const match of normalized.matchAll(LATIN_TERM)) {
    const term = match[0];
    if (term.length >= 2 && !CJK_ONLY.test(term)) terms.add(term);
  }

  for (const match of normalized.matchAll(CJK_SEQUENCE)) {
    const sequence = match[0];
    if (sequence.length === 1) {
      terms.add(sequence);
      continue;
    }
    for (let index = 0; index < sequence.length - 1; index++) {
      terms.add(sequence.slice(index, index + 2));
    }
  }

  return [...terms];
}

function splitPassages(text: string): string[] {
  const sentences = text
    .replace(/\r\n/g, '\n')
    .match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean);
  return sentences && sentences.length > 0 ? sentences : [text.trim()].filter(Boolean);
}

function boundedText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, Math.max(1, maxChars));
  const lastSpace = candidate.lastIndexOf(' ');
  return lastSpace >= Math.floor(maxChars * 0.4) ? candidate.slice(0, lastSpace) : candidate;
}

/**
 * Select the sentence with the strongest lexical overlap with the query.
 * This intentionally stays deterministic and dependency-free so benchmark
 * fixtures can reproduce the same evidence packet on every supported runtime.
 */
export function selectRelevantPassage(
  text: string,
  query: string,
  maxChars: number,
): PassageSelection {
  const passages = splitPassages(text);
  if (passages.length === 0 || maxChars <= 0) {
    return { text: '', score: 0, matched_terms: [] };
  }

  const terms = extractQueryTerms(query);
  let best = passages[0];
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const passage of passages) {
    const normalized = passage.toLowerCase();
    const matched = terms.filter(term => normalized.includes(term));
    const coverage = terms.length > 0 ? matched.length / terms.length : 0;
    const density = matched.length / Math.max(passage.length / 80, 1);
    const exactBonus = query.trim() && normalized.includes(query.trim().toLowerCase()) ? 0.5 : 0;
    const score = coverage + Math.min(density * 0.1, 0.3) + exactBonus;

    if (score > bestScore) {
      best = passage;
      bestScore = score;
      bestMatches = matched;
    }
  }

  return {
    text: boundedText(best, maxChars),
    score: Math.round(bestScore * 1000) / 1000,
    matched_terms: bestMatches.slice(0, 8),
  };
}
