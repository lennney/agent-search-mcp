#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  poolLiveCaptures,
  prepareReviewAdjudication,
  validateCompletedAdjudication,
} from './lib/pooling.mjs';
import { evaluatePooledComparison } from './lib/comparison-metrics.mjs';

const argv = process.argv.slice(2);

try {
  const captureOptions = optionValues('--capture');
  const prepareSource = optionValue('--prepare-adjudication');
  const verifySource = optionValue('--verify-adjudication');
  const compareSource = optionValue('--compare');
  const selectedModes = [
    captureOptions.length > 0,
    prepareSource !== undefined,
    verifySource !== undefined,
    compareSource !== undefined,
  ].filter(Boolean).length;

  if (selectedModes !== 1) usage();

  if (captureOptions.length > 0) {
    const output = requiredOption('--output');
    const captures = await Promise.all(captureOptions.map(async option => {
      const separator = option.indexOf('=');
      if (separator <= 0 || separator === option.length - 1) {
        throw new Error('--capture must use system-id=path');
      }
      return {
        systemId: option.slice(0, separator),
        capture: await readJson(option.slice(separator + 1)),
      };
    }));
    await writeJson(output, poolLiveCaptures(captures));
    console.error(`Wrote pooled search capture to ${resolve(output)}`);
  } else if (prepareSource !== undefined) {
    const output = requiredOption('--output');
    const reviewPaths = optionValues('--review');
    if (reviewPaths.length < 2) {
      throw new Error('--prepare-adjudication requires at least two --review files');
    }
    const pool = await readJson(prepareSource);
    const reviews = await Promise.all(reviewPaths.map(readJson));
    await writeJson(output, prepareReviewAdjudication(pool, reviews));
    console.error(`Wrote pending adjudication to ${resolve(output)}`);
  } else if (verifySource !== undefined) {
    validateCompletedAdjudication(await readJson(verifySource));
    console.error(`Verified completed human adjudication at ${resolve(verifySource)}`);
  } else {
    const output = requiredOption('--output');
    const adjudicationPath = requiredOption('--adjudication');
    const report = evaluatePooledComparison(
      await readJson(compareSource),
      await readJson(adjudicationPath),
    );
    await writeJson(output, report);
    console.error(`Wrote human-verified pooled comparison to ${resolve(output)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${name} requires a value`);
      }
      values.push(value);
      index += 1;
    }
  }
  return values;
}

function optionValue(name) {
  const values = optionValues(name);
  if (values.length > 1) throw new Error(`${name} may only be provided once`);
  return values[0];
}

function requiredOption(name) {
  const value = optionValue(name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function writeJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function usage() {
  throw new Error([
    'Usage:',
    '  node benchmarks/pool.mjs --capture system-id=path --capture other-id=path --output pool.json',
    '  node benchmarks/pool.mjs --prepare-adjudication pool.json --review a.json --review b.json --output adjudication.json',
    '  node benchmarks/pool.mjs --verify-adjudication completed-adjudication.json',
    '  node benchmarks/pool.mjs --compare pool.json --adjudication completed.json --output report.json',
  ].join('\n'));
}
