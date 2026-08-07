import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateCompetitiveQuerySet } from '../../benchmarks/lib/competitive-query-set.mjs';

const QUERY_SET_PATH = resolve('benchmarks/queries/competitive-comparison-v1.json');

describe('competitive query set', () => {
  it('contains the preregistered bilingual and category strata', async () => {
    const input = JSON.parse(await readFile(QUERY_SET_PATH, 'utf8'));

    expect(validateCompetitiveQuerySet(input)).toMatchObject({
      query_count: 30,
      language_counts: { en: 15, zh: 15 },
      category_counts: { factual: 10, technical: 10, navigational: 10 },
    });
  });

  it('rejects duplicate, dynamic, or non-HTTP query contracts', async () => {
    const input = JSON.parse(await readFile(QUERY_SET_PATH, 'utf8'));
    input.queries[1].query = input.queries[0].query.toUpperCase();
    expect(() => validateCompetitiveQuerySet(input)).toThrow(/duplicate normalized query/);

    input.queries[1].query = 'latest protocol news';
    expect(() => validateCompetitiveQuerySet(input)).toThrow(/freshness term/);

    input.queries[1].query = 'HTTP rate limiting semantics';
    input.queries[1].reference_sources = ['file:///tmp/reference'];
    expect(() => validateCompetitiveQuerySet(input)).toThrow(/HTTP/);
  });
});
