import { createHash } from 'node:crypto';

const LANGUAGES = new Set(['en', 'zh']);
const CATEGORIES = new Set(['factual', 'technical', 'navigational']);
const BANNED_QUERY_PATTERNS = [
  /\b(?:19|20)\d{2}\b/u,
  /\b(?:latest|today|news|current|best)\b/iu,
  /(?:最新|今日|新闻|时事|本周|今年)/u,
  /\b(?:agent[ -]?search|open-websearch|ddgs)\b/iu,
];

function fail(message) {
  throw new Error(`Invalid competitive query set: ${message}`);
}

function normalizeQuery(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireText(item, field, index) {
  if (typeof item[field] !== 'string' || item[field].trim().length === 0) {
    fail(`query ${index + 1} requires ${field}`);
  }
  return item[field].trim();
}

export function validateCompetitiveQuerySet(input) {
  const queries = Array.isArray(input) ? input : input?.queries;
  if (!Array.isArray(queries) || queries.length !== 30) {
    fail('exactly 30 queries are required');
  }

  const ids = new Set();
  const normalizedQueries = new Set();
  const languageCounts = { en: 0, zh: 0 };
  const categoryCounts = { factual: 0, technical: 0, navigational: 0 };

  for (const [index, item] of queries.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      fail(`query ${index + 1} must be an object`);
    }
    const id = requireText(item, 'id', index);
    const query = requireText(item, 'query', index);
    requireText(item, 'question', index);
    requireText(item, 'reference_answer', index);

    if (ids.has(id)) fail(`duplicate id ${id}`);
    ids.add(id);
    const normalized = normalizeQuery(query);
    if (normalizedQueries.has(normalized)) fail(`duplicate normalized query ${query}`);
    normalizedQueries.add(normalized);

    if (!LANGUAGES.has(item.language)) fail(`${id} has unsupported language`);
    if (!CATEGORIES.has(item.category)) fail(`${id} has unsupported category`);
    if (item.freshness !== 'evergreen') fail(`${id} must use freshness evergreen`);
    languageCounts[item.language] += 1;
    categoryCounts[item.category] += 1;

    if (!Array.isArray(item.reference_sources) || item.reference_sources.length === 0) {
      fail(`${id} requires at least one reference source`);
    }
    for (const source of item.reference_sources) {
      if (typeof source !== 'string') fail(`${id} reference sources must be URLs`);
      let url;
      try {
        url = new URL(source);
      } catch {
        fail(`${id} contains an invalid reference source URL`);
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        fail(`${id} reference sources must use HTTP(S)`);
      }
    }
    if (BANNED_QUERY_PATTERNS.some(pattern => pattern.test(query))) {
      fail(`${id} contains a date, freshness term, or compared-system brand`);
    }
  }

  if (languageCounts.en !== 15 || languageCounts.zh !== 15) {
    fail('English and Chinese must each contain 15 queries');
  }
  for (const category of CATEGORIES) {
    if (categoryCounts[category] !== 10) {
      fail(`${category} must contain 10 queries`);
    }
  }

  return {
    schema_version: 1,
    query_count: queries.length,
    language_counts: languageCounts,
    category_counts: categoryCounts,
    query_set_sha256: sha256(queries),
  };
}
