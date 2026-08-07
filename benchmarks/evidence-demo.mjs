#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildEvidenceDemoReport,
  formatEvidenceDemoSummary,
  verifyEvidenceDemoReport,
} from './lib/evidence-demo.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const fixturePath = resolve(
  ROOT,
  option('--fixture') ?? 'benchmarks/fixtures/evidence-demo.json',
);
const [fixture, evidenceModule, formatModule, outputModule] = await Promise.all([
  readJson(fixturePath),
  import('../dist/aggregation/search-evidence.js'),
  import('../dist/aggregation/format.js'),
  import('../dist/tools/search-output.js'),
]);
const report = buildEvidenceDemoReport(fixture, {
  createSearchEvidenceEvaluator: evidenceModule.createSearchEvidenceEvaluator,
  createSearchToolResult: outputModule.createSearchToolResult,
  formatResults: formatModule.formatResults,
});
verifyEvidenceDemoReport(report, fixture);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${formatEvidenceDemoSummary(report)}\n`);
}
