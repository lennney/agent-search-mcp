#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import {
  evaluateQualityFixture,
  prepareHumanLabelTemplate,
  validateQualityFixture,
} from './lib/quality-metrics.mjs';

const ROOT = resolve(import.meta.dirname, '..');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const prepareCapturePath = option('--prepare-capture');
if (prepareCapturePath) {
  const outputPath = option('--output');
  if (!outputPath) throw new Error('--prepare-capture requires --output');
  const capture = JSON.parse(await readFile(resolve(ROOT, prepareCapturePath), 'utf8'));
  const template = prepareHumanLabelTemplate(capture);
  await writeJson(resolve(ROOT, outputPath), template);
  console.log(`Prepared human-label template at ${resolve(ROOT, outputPath)}`);
} else {
  const fixturePath = resolve(
    ROOT,
    option('--fixture') || 'benchmarks/fixtures/quality-bootstrap.json',
  );
  const fixtureText = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(fixtureText);
  validateQualityFixture(fixture, {
    requireHuman: process.argv.includes('--require-human'),
  });
  const evaluated = evaluateQualityFixture(fixture, {
    requireHuman: process.argv.includes('--require-human'),
  });
  const report = {
    schema_version: 1,
    fixture: relative(ROOT, fixturePath).replaceAll('\\', '/'),
    fixture_sha256: createHash('sha256').update(fixtureText).digest('hex'),
    generated_at: new Date().toISOString(),
    summary: evaluated.summary,
    slices: evaluated.slices,
  };

  if (process.argv.includes('--check')) {
    if (!fixture.expected_summary) {
      throw new Error('Fixture has no expected_summary; run with --update-expected first');
    }
    if (JSON.stringify(fixture.expected_summary) !== JSON.stringify(evaluated.summary)) {
      throw new Error(
        `Quality benchmark drift detected.\n`
        + `Expected: ${JSON.stringify(fixture.expected_summary)}\n`
        + `Actual:   ${JSON.stringify(evaluated.summary)}`,
      );
    }
    console.log('Quality benchmark matches expected_summary');
  } else if (process.argv.includes('--update-expected')) {
    fixture.expected_summary = evaluated.summary;
    await writeJson(fixturePath, fixture);
    console.log(`Updated expected_summary in ${fixturePath}`);
  }

  const outputPath = option('--output');
  if (outputPath) await writeJson(resolve(ROOT, outputPath), report);
  console.log(JSON.stringify(evaluated.summary, null, 2));
}
