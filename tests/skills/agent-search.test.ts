import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { toolRegistry } from '../../src/tools/registry.js';

async function readProjectFile(path: string): Promise<string> {
  return readFile(resolve(path), 'utf8');
}

describe('official Agent Search skill', () => {
  it('defines the four evidence-first routes without placeholder text', async () => {
    const source = await readProjectFile('skills/agent-search/SKILL.md');
    const registeredTools = new Set(toolRegistry.map(tool => tool.id));

    const normalized = source.replaceAll('\r\n', '\n');

    expect(normalized).toMatch(/^---\nname: agent-search\n/m);
    expect(normalized).not.toContain('TODO');
    for (const route of ['quick', 'verify', 'chinese', 'extract']) {
      expect(normalized).toContain(`\`${route}\``);
    }
    for (const tool of ['free_search', 'free_search_advanced', 'free_extract']) {
      expect(registeredTools.has(tool)).toBe(true);
      expect(normalized).toContain(`\`${tool}\``);
    }
    expect(normalized).toContain('search://capabilities');
    expect(normalized).toContain('search://health');
    expect(normalized).toContain('`UNSUPPORTED_FILTER`');
    expect(normalized).toContain('`partialFailures`');
    expect(normalized).toContain('Do not retry');
    expect(normalized).toContain('## Check prerequisites');
    expect(normalized).toContain('Ask for\n  approval before installing anything');
    expect(normalized).toContain('Do not invent host-specific setup commands');
    expect(normalized).toContain(
      'Select this path for the desired source ecosystem, not merely because',
    );
    expect(normalized).toContain(
      '"Prefer\n  official sources" does not by itself mean "exclude every other domain"',
    );
    expect(normalized).toMatch(
      /1\. If the user supplied[\s\S]*2\. If the request targets Chinese[\s\S]*3\. If the task verifies[\s\S]*4\. Otherwise, use `quick`/,
    );
  });

  it('keeps UI metadata aligned and explicitly invocable', async () => {
    const metadata = parseYaml(
      await readProjectFile('skills/agent-search/agents/openai.yaml'),
    );

    expect(metadata.interface).toEqual({
      display_name: 'Agent Search',
      short_description: 'Evidence-first English and Chinese web search',
      default_prompt:
        'Use $agent-search to find and verify web evidence with the smallest suitable tool path.',
    });
  });

  it('ships the skill in the reviewed npm package surface', async () => {
    const packageJson = JSON.parse(await readProjectFile('package.json'));
    const packageManifest = JSON.parse(
      await readProjectFile('scripts/npm-package-files.json'),
    );

    expect(packageJson.files).toContain('skills/**');
    expect(packageManifest).toEqual(expect.arrayContaining([
      'skills/agent-search/SKILL.md',
      'skills/agent-search/agents/openai.yaml',
    ]));
  });

  it('documents Skill installation separately from MCP setup', async () => {
    const readmes = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('README_zh.md'),
    ]);

    for (const readme of readmes) {
      expect(readme).toContain(
        'npx skills add lennney/agent-search-mcp --skill agent-search',
      );
      expect(readme).toContain('skills/agent-search/SKILL.md');
    }
  });
});
