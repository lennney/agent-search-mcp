#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { calibrateRelevanceGate } from './lib/relevance-calibration.mjs';

const argv = process.argv.slice(2);

try {
  const poolPath = requiredOption('--pool');
  const adjudicationPath = requiredOption('--adjudication');
  const systemId = requiredOption('--system-id');
  const output = requiredOption('--output');
  const report = calibrateRelevanceGate(
    await readJson(poolPath),
    await readJson(adjudicationPath),
    systemId,
    {
      ...numberOption('--current-threshold', 'currentThreshold'),
      ...numberOption('--target-precision', 'targetPrecision'),
      ...integerOption('--minimum-queries', 'minimumQueries'),
      ...integerOption('--minimum-judgments', 'minimumJudgments'),
    },
  );
  await writeJson(output, report);
  const recommendation = report.recommended_threshold === null
    ? `no recommendation (${report.readiness.status})`
    : `recommended threshold ${report.recommended_threshold}`;
  console.error(`Wrote relevance calibration to ${resolve(output)}: ${recommendation}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function optionValue(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  if (argv.indexOf(name, index + 1) !== -1) {
    throw new Error(`${name} may only be provided once`);
  }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function requiredOption(name) {
  const value = optionValue(name);
  if (value === undefined) usage(`${name} is required`);
  return value;
}

function numberOption(name, property) {
  const raw = optionValue(name);
  if (raw === undefined) return {};
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return { [property]: value };
}

function integerOption(name, property) {
  const parsed = numberOption(name, property);
  if (parsed[property] !== undefined && !Number.isInteger(parsed[property])) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function writeJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function usage(message) {
  throw new Error([
    message,
    'Usage:',
    '  node benchmarks/calibrate-relevance.mjs --pool pool.json --adjudication completed.json --system-id agent-search --output calibration.json',
    'Optional:',
    '  --current-threshold 0.35 --target-precision 0.8 --minimum-queries 10 --minimum-judgments 30',
  ].join('\n'));
}
