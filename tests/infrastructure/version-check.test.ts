import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  readCurrentVersion,
} from '../../src/infrastructure/version-check.js';

describe('version check', () => {
  it('reads the package version from the compiled infrastructure location', () => {
    const compiledModule = pathToFileURL(join(
      process.cwd(),
      'dist',
      'infrastructure',
      'version-check.js',
    )).href;

    expect(readCurrentVersion(compiledModule)).toBe('3.1.3');
  });
});
