import { describe, expect, it } from 'vitest';

import {
  engines,
  freeEngines,
  optionalEngineCredentialEnvironment,
  paidEngines,
} from '../../src/engines/index.js';
import {
  boundedIntegerConfig,
  publicCapabilityControls,
} from '../../src/infrastructure/config.js';
import { renderPublicCapabilityMatrix } from '../../src/tools/public-capabilities.js';
import { toolRegistry } from '../../src/tools/registry.js';

describe('public capability registry', () => {
  it('derives engine access groups and credentials from one registry', () => {
    expect(freeEngines).toEqual(
      Object.values(engines)
        .filter(engine => engine.isFree)
        .map(engine => engine.id),
    );
    expect(paidEngines).toEqual(
      Object.values(engines)
        .filter(engine => !engine.isFree)
        .map(engine => engine.id),
    );
    for (const engine of Object.values(engines)) {
      expect(optionalEngineCredentialEnvironment[engine.id]).toBe(
        engine.credentialEnvironment,
      );
    }
  });

  it('keeps tool identifiers unique', () => {
    const identifiers = toolRegistry.map(tool => tool.id);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('renders every shipped engine, tool, and public control', () => {
    const markdown = renderPublicCapabilityMatrix('en');
    for (const engine of Object.values(engines)) {
      expect(markdown).toContain(`| ${engine.name} |`);
    }
    for (const tool of toolRegistry) {
      expect(markdown).toContain(`| \`${tool.id}\` |`);
    }
    for (const control of publicCapabilityControls) {
      expect(markdown).toContain(`\`${control.environment}\``);
    }
  });

  it('renders the active tool surface without mutating the registry', () => {
    const originalCount = toolRegistry.length;
    const markdown = renderPublicCapabilityMatrix('zh', {
      isToolEnabled: toolId => toolId === 'free_search',
    });
    expect(markdown).toContain('| `free_search` |');
    expect(markdown).not.toContain('| `free_extract` |');
    expect(toolRegistry).toHaveLength(originalCount);
  });

  it('uses the parsing schema defaults for published budget controls', () => {
    for (const definition of Object.values(boundedIntegerConfig).slice(0, 4)) {
      expect(publicCapabilityControls).toContainEqual(
        expect.objectContaining({
          environment: definition.environment,
          defaultValue: String(definition.fallback),
        }),
      );
    }
  });
});
