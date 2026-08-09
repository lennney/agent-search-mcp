#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { validateCompetitiveQuerySet } from './lib/competitive-query-set.mjs';

const path = resolve(process.argv[2] ?? 'benchmarks/queries/competitive-comparison-v1.json');

try {
  const querySet = JSON.parse(await readFile(path, 'utf8'));
  console.log(JSON.stringify(validateCompetitiveQuerySet(querySet), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
