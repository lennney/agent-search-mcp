import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { engines } from '../src/engines/index.js';

interface PackageMetadata {
  description: string;
  distributionMetadata: {
    githubTopics: string[];
  };
  keywords: string[];
  mcpName: string;
  version: string;
}

interface RegistryEnvironmentVariable {
  format: string;
  isRequired: boolean;
  isSecret: boolean;
  name: string;
}

interface RegistryMetadata {
  description: string;
  name: string;
  packages: Array<{
    environmentVariables?: RegistryEnvironmentVariable[];
    identifier: string;
    version: string;
  }>;
  version: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

describe('release registry metadata', () => {
  const packageMetadata = readJson<PackageMetadata>('../package.json');
  const registryMetadata = readJson<RegistryMetadata>('../server.json');
  const registryPackage = registryMetadata.packages[0];
  const variables = registryPackage.environmentVariables ?? [];

  it('keeps package and MCP Registry identity aligned', () => {
    expect(registryMetadata.name).toBe(packageMetadata.mcpName);
    expect(registryMetadata.description).toBe(packageMetadata.description);
    expect(registryMetadata.version).toBe(packageMetadata.version);
    expect(registryPackage.identifier).toBe('agent-search-mcp');
    expect(registryPackage.version).toBe(packageMetadata.version);
  });

  it('uses durable discovery metadata instead of volatile inventory claims', () => {
    expect(packageMetadata.description).toContain('Free-first web search MCP');
    expect(packageMetadata.description).toContain('zero-key English and Chinese sources');
    expect(packageMetadata.description.length).toBeLessThanOrEqual(100);
    expect(packageMetadata.description).not.toMatch(/\b\d+\s+(?:zero-key|free)\s+engines?\b/i);
    expect(packageMetadata.description).not.toMatch(/\b(?:only|best|unique)\b/i);
    expect(packageMetadata.keywords).toEqual(expect.arrayContaining([
      'metasearch',
      'privacy-first',
      'search-aggregator',
      'web-scraping',
      'zero-config',
    ]));
    expect(packageMetadata.distributionMetadata.githubTopics).toHaveLength(20);
    expect(new Set(packageMetadata.distributionMetadata.githubTopics).size).toBe(20);
  });

  it('publishes every optional provider credential as an optional secret', () => {
    const expectedCredentials = Object.values(engines)
      .flatMap(engine => engine.credentialEnvironment ?? [])
      .sort();
    const publishedCredentials = variables
      .filter(variable => variable.isSecret)
      .map(variable => variable.name)
      .sort();

    expect(publishedCredentials).toEqual(expectedCredentials);
    for (const variable of variables.filter(item => item.isSecret)) {
      expect(variable).toMatchObject({
        format: 'string',
        isRequired: false,
      });
    }
  });

  it('publishes spend controls without exposing transport overrides', () => {
    const names = variables.map(variable => variable.name);
    expect(names).toEqual(expect.arrayContaining([
      'SEARCH_PROVIDER_MODE',
      'PAID_ENGINE_ORDER',
    ]));
    expect(names).not.toEqual(expect.arrayContaining(['MODE', 'PORT']));
  });
});
