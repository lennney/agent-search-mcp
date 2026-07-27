#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const capture = await readJson('benchmarks/fixtures/live-reviewer-pilot.json');
const pending = await readJson('benchmarks/fixtures/live-reviewer-pilot-labels.pending.json');
const packets = await Promise.all([
  readJson('benchmarks/reviews/live-reviewer-pilot.reviewer-a.pending.json'),
  readJson('benchmarks/reviews/live-reviewer-pilot.reviewer-b.pending.json'),
]);

assert.equal(capture.kind, 'live-capture');
assert.deepEqual(capture.requested_engines, ['wikipedia']);
assert.equal(capture.content_licenses?.wikipedia?.license, 'CC BY-SA 4.0');
assert.ok(capture.samples.length > 0);
assert.ok(capture.samples.every(sample => sample.response?.results?.length > 0));
for (const sample of capture.samples) {
  assert.equal(
    sample.trace.raw_response_sha256,
    sha256(JSON.stringify(sample.response)),
    `${sample.id} raw response hash`,
  );
}

assert.equal(pending.labeling.status, 'pending-human');
assert.equal(pending.source_capture_sha256, sha256(JSON.stringify(capture)));
assert.equal(pending.samples.length, capture.samples.length);

const pendingHash = sha256(JSON.stringify(pending));
for (const packet of packets) {
  assert.equal(packet.kind, 'blinded-search-review');
  assert.equal(packet.source_fixture_sha256, pendingHash);
  assert.equal(packet.content_licenses?.wikipedia?.license, 'CC BY-SA 4.0');
  assert.deepEqual(packet.reviewer, {
    id: null,
    kind: 'human',
    completed_at: null,
  });
  assert.deepEqual(findForbiddenKeys(packet), []);

  for (const sample of packet.samples) {
    const sourceSample = capture.samples.find(candidate => candidate.id === sample.id);
    assert.ok(sourceSample, `${sample.id} exists in capture`);
    const sourceUrls = sourceSample.response.results.map(result => result.url);
    const reviewedUrls = sample.candidates.map(candidate => candidate.url);
    assert.deepEqual([...reviewedUrls].sort(), [...sourceUrls].sort());
    assert.notDeepEqual(reviewedUrls, sourceUrls, `${sample.id} hides original rank`);
    assert.ok(sample.candidates.every(candidate =>
      /^c-[a-f0-9]{12}$/.test(candidate.candidate_id)
      && candidate.relevance === null
      && candidate.citation_supported === null));
  }
}

assert.notEqual(packets[0].reviewer_slot, packets[1].reviewer_slot);
console.log('Reviewer pilot artifacts are internally consistent and remain pending-human');

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function findForbiddenKeys(value) {
  const forbidden = new Set([
    'confidence',
    'engine_outcomes',
    'partialFailures',
    'relevance_score',
    'source_count',
    'sources',
  ]);
  const found = new Set();
  visit(value);
  return [...found].sort();

  function visit(current) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current === null || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(key)) found.add(key);
      visit(child);
    }
  }
}
