import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ACTIVE_URL_CANONICALIZATION_VERSION,
  canonicalizeUrl,
} from '../../src/aggregation/url-canonicalization.js';

interface CalibrationCase {
  id: string;
  left: string;
  right: string;
  relation: 'same' | 'different';
}

const fixture = JSON.parse(readFileSync(
  new URL(
    '../../benchmarks/fixtures/url-canonicalization-calibration-v1.json',
    import.meta.url,
  ),
  'utf8',
)) as { cases: CalibrationCase[] };

function mismatches(version: 'v1' | 'v2-candidate'): string[] {
  return fixture.cases.flatMap((testCase) => {
    const actualSame = canonicalizeUrl(testCase.left, version)
      === canonicalizeUrl(testCase.right, version);
    const expectedSame = testCase.relation === 'same';
    return actualSame === expectedSame ? [] : [testCase.id];
  });
}

describe('URL canonicalization calibration', () => {
  it('keeps the production contract pinned to legacy v1', () => {
    expect(ACTIVE_URL_CANONICALIZATION_VERSION).toBe('v1');
  });

  it('records the known false merges in v1 instead of hiding them', () => {
    expect(mismatches('v1')).toEqual([
      'identity-parameter',
      'pagination-parameter',
      'language-parameter',
      'case-sensitive-path',
    ]);
  });

  it('passes the synthetic identity and tracking cases with the v2 candidate', () => {
    expect(mismatches('v2-candidate')).toEqual([]);
  });
});
