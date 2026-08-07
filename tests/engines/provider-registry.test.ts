import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ENGINE_WEIGHTS,
  PROVIDER_FAMILIES,
  SEARCH_PROVIDERS,
  WATERFALL_PHASES,
  freeEngines,
  paidEngines,
  providerCatalog,
} from '../../src/engines/provider-catalog.js';
import { providerRuntimeRegistry } from '../../src/engines/runtime-registry.js';

describe('provider catalog', () => {
  it('is the ordered owner of provider identity and access groups', () => {
    expect(Object.keys(providerCatalog)).toEqual(SEARCH_PROVIDERS);
    expect(freeEngines).toEqual([
      'duckduckgo',
      'sogou',
      'bing',
      'baidu',
      'wikipedia',
      'startpage',
      'yandex',
      'mojeek',
      'wiby',
    ]);
    expect(paidEngines).toEqual([
      'brave',
      'tavily',
      'exa',
      'youcom',
      'tencent_wsa',
      'bocha',
      'serper',
    ]);
  });

  it('owns the unchanged weights and waterfall phases', () => {
    expect(ENGINE_WEIGHTS).toEqual({
      duckduckgo: 0.85,
      sogou: 0.8,
      bing: 0.9,
      baidu: 0.75,
      wikipedia: 0.93,
      startpage: 0.86,
      yandex: 0.82,
      mojeek: 0.8,
      wiby: 0.78,
      brave: 0.95,
      tavily: 0.9,
      exa: 0.92,
      youcom: 0.91,
      tencent_wsa: 0.9,
      bocha: 0.9,
      serper: 0.9,
    });
    expect(WATERFALL_PHASES).toEqual({
      phase1a: ['duckduckgo', 'sogou'],
      phase1b: ['bing', 'baidu'],
      phase1c: ['wikipedia', 'startpage', 'yandex', 'mojeek', 'wiby'],
    });
  });

  it('projects the versioned provider-family contract', () => {
    const contract = JSON.parse(readFileSync(
      new URL(
        '../../docs/contracts/provider-families-v1.json',
        import.meta.url,
      ),
      'utf8',
    )) as { families: Record<string, string> };

    expect(PROVIDER_FAMILIES).toEqual(contract.families);
  });
});

describe('provider runtime registry', () => {
  it('binds exactly one executor to every catalog entry', () => {
    expect(Object.keys(providerRuntimeRegistry)).toEqual(SEARCH_PROVIDERS);
    for (const provider of SEARCH_PROVIDERS) {
      expect(providerRuntimeRegistry[provider].id).toBe(provider);
      expect(providerRuntimeRegistry[provider].search).toBeTypeOf('function');
    }
  });

  it('removes adapter imports and the invocation switch from the orchestrator', () => {
    const source = readFileSync(
      new URL('../../src/tools/free-search.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(
      /from ['"]\.\.\/engines\/(?!engine-error|provider-catalog|runtime-registry)/,
    );
    expect(source).not.toMatch(/switch\s*\(engine\)/);
  });
});
