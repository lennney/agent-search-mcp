#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { normalizeExternalCapture } from './lib/external-capture.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);

try {
  const inputPath = requiredOption('--input');
  const querySetPath = requiredOption('--query-set');
  const outputPath = requiredOption('--output');
  const [input, querySet] = await Promise.all([
    readJson(resolve(ROOT, inputPath)),
    readJson(resolve(ROOT, querySetPath)),
  ]);
  const capture = normalizeExternalCapture(input, querySet);
  await writeJson(resolve(ROOT, outputPath), capture);
  console.error(`Imported external capture to ${resolve(ROOT, outputPath)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function requiredOption(name) {
  const indexes = argv
    .map((value, index) => (value === name ? index : -1))
    .filter(index => index >= 0);
  if (indexes.length !== 1) throw new Error(`${name} is required exactly once`);
  const value = argv[indexes[0] + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
