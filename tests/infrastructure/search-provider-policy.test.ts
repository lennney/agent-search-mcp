import { describe, expect, it } from 'vitest';

import {
  createSearchProviderPlan,
  type SearchProviderMode,
} from '../../src/infrastructure/search-provider-policy.js';
import type { SearchProvider } from '../../src/types.js';

const freeStages: SearchProvider[][] = [
  ['duckduckgo', 'sogou'],
  ['bing', 'baidu'],
];
const paidEngines: SearchProvider[] = ['brave', 'exa', 'tavily', 'youcom'];

function plan(
  mode: SearchProviderMode,
  configured: SearchProvider[] = paidEngines,
) {
  return createSearchProviderPlan({
    mode,
    freeStages,
    paidEngines,
    hasCredential: engine => configured.includes(engine),
  });
}

describe('createSearchProviderPlan', () => {
  it('keeps free_first free even when paid credentials exist', () => {
    expect(plan('free_first')).toEqual([
      { kind: 'free', engines: ['duckduckgo', 'sogou'] },
      { kind: 'free', engines: ['bing', 'baidu'] },
    ]);
  });

  it('adds only the first configured paid provider after free stages', () => {
    expect(plan('quality_escalation', ['brave', 'exa'])).toEqual([
      { kind: 'free', engines: ['duckduckgo', 'sogou'] },
      { kind: 'free', engines: ['bing', 'baidu'] },
      { kind: 'optional', engines: ['brave'] },
    ]);
  });

  it('places configured paid providers first in paid_first mode', () => {
    expect(plan('paid_first', ['exa'])).toEqual([
      { kind: 'optional', engines: ['exa'] },
      { kind: 'free', engines: ['duckduckgo', 'sogou'] },
      { kind: 'free', engines: ['bing', 'baidu'] },
    ]);
  });

  it('falls back to free stages when paid_first has no credentials', () => {
    expect(plan('paid_first', [])).toEqual([
      { kind: 'free', engines: ['duckduckgo', 'sogou'] },
      { kind: 'free', engines: ['bing', 'baidu'] },
    ]);
  });

  it('never includes paid providers in free_only mode', () => {
    expect(plan('free_only')).toEqual([
      { kind: 'free', engines: ['duckduckgo', 'sogou'] },
      { kind: 'free', engines: ['bing', 'baidu'] },
    ]);
  });
});
