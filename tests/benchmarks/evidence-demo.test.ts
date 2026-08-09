import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatResults } from '../../src/aggregation/format.js';
import { createSearchEvidenceEvaluator } from '../../src/aggregation/search-evidence.js';
import { createSearchToolResult } from '../../src/tools/search-output.js';
import {
  buildEvidenceDemoReport,
  formatEvidenceDemoSummary,
  verifyEvidenceDemoReport,
} from '../../benchmarks/lib/evidence-demo.mjs';

const FIXTURE_PATH = resolve('benchmarks/fixtures/evidence-demo.json');

async function buildReport() {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  return {
    fixture,
    report: buildEvidenceDemoReport(fixture, {
      createSearchEvidenceEvaluator,
      createSearchToolResult,
      formatResults,
    }),
  };
}

describe('offline search evidence demo', () => {
  it('demonstrates provider-family counting and visible fallback failures', async () => {
    const { report } = await buildReport();
    const sameFamily = report.scenarios.find(item => item.id === 'same-family-corroboration');
    const fallback = report.scenarios.find(item => item.id === 'visible-fallback-failure');

    expect(sameFamily).toMatchObject({
      result_count: 1,
      top_result: {
        sources: ['duckduckgo', 'bing'],
        provider_family_count: 1,
      },
      quality_gate: { sufficient: false, providerFamilyCount: 1 },
    });
    expect(fallback).toMatchObject({
      result_count: 1,
      partial_failures: [{ engine: 'duckduckgo', type: 'bot_challenge' }],
    });
    expect(fallback.tool_views.text).toContain('Partial failures: duckduckgo:bot_challenge');
  });

  it('shows bounded early stop and a smaller text view without losing URLs', async () => {
    const { report } = await buildReport();
    const bounded = report.scenarios.find(item => item.id === 'bounded-quality-stop');

    expect(bounded).toMatchObject({
      execution: {
        early_stop: true,
        stop_reason: 'quality_gate_satisfied',
      },
      quality_gate: { sufficient: true, providerFamilyCount: 2 },
      skipped_engines: ['baidu', 'mojeek'],
      compacted_count: 3,
      provenance_checks: {
        all_urls_in_text: true,
        source_signal_in_text: true,
        structured_content_is_canonical: true,
      },
    });
    expect(bounded.tool_views.text_tokens).toBeLessThan(
      bounded.tool_views.structured_tokens,
    );
  });

  it('is deterministic, verifies fixture expectations, and makes no quality claim', async () => {
    const { fixture, report } = await buildReport();
    const second = buildEvidenceDemoReport(fixture, {
      createSearchEvidenceEvaluator,
      createSearchToolResult,
      formatResults,
    });

    expect(second).toEqual(report);
    expect(report).toMatchObject({
      kind: 'synthetic-evidence-demo-report',
      claim_scope: 'contract-demonstration-only',
      quality_claim_eligible: false,
    });
    expect(() => verifyEvidenceDemoReport(report, fixture)).not.toThrow();
    const summary = formatEvidenceDemoSummary(report);
    expect(summary).toContain('Synthetic contract demo; not a live search-quality claim.');
    expect(summary).toContain(
      'results=1 families=1 gate=continue stop=phases_exhausted',
    );
  });
});
