import { createHash } from 'node:crypto';

import { encode } from 'gpt-tokenizer';

const EXPECTED_FIXTURE_KIND = 'synthetic-evidence-demo';
const REPORT_KIND = 'synthetic-evidence-demo-report';

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokenCount(value) {
  return encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validateFixture(fixture) {
  const input = assertObject(fixture, 'fixture');
  if (input.kind !== EXPECTED_FIXTURE_KIND) {
    throw new Error(`fixture kind must be ${EXPECTED_FIXTURE_KIND}`);
  }
  if (input.claim_scope !== 'contract-demonstration-only') {
    throw new Error('fixture claim_scope must be contract-demonstration-only');
  }
  if (input.quality_claim_eligible !== false) {
    throw new Error('synthetic evidence demo cannot be quality-claim eligible');
  }
  assertNonEmptyString(input.security_note, 'fixture.security_note');
  if (!Array.isArray(input.scenarios) || input.scenarios.length === 0) {
    throw new Error('fixture.scenarios must be a non-empty array');
  }

  const ids = new Set();
  for (const [index, rawScenario] of input.scenarios.entries()) {
    const scenario = assertObject(rawScenario, `scenario ${index + 1}`);
    const id = assertNonEmptyString(scenario.id, `scenario ${index + 1}.id`);
    if (ids.has(id)) throw new Error(`duplicate scenario id: ${id}`);
    ids.add(id);
    assertNonEmptyString(scenario.title, `${id}.title`);
    assertNonEmptyString(scenario.query, `${id}.query`);
    if (!Array.isArray(scenario.raw_results)) {
      throw new Error(`${id}.raw_results must be an array`);
    }
    const execution = assertObject(scenario.execution, `${id}.execution`);
    const searchedEngines = assertStringArray(
      execution.searched_engines,
      `${id}.execution.searched_engines`,
    );
    if (execution.engine_calls !== searchedEngines.length) {
      throw new Error(`${id}.execution.engine_calls must match searched_engines`);
    }
    assertStringArray(execution.phases_completed, `${id}.execution.phases_completed`);
    if (execution.early_stop === true
      && execution.stop_reason !== 'quality_gate_satisfied') {
      throw new Error(`${id} early_stop requires quality_gate_satisfied`);
    }
    const skippedEngines = assertStringArray(
      scenario.skipped_engines ?? [],
      `${id}.skipped_engines`,
    );
    if (skippedEngines.some(engine => searchedEngines.includes(engine))) {
      throw new Error(`${id} cannot both search and skip the same engine`);
    }
    if (!Array.isArray(scenario.partial_failures)) {
      throw new Error(`${id}.partial_failures must be an array`);
    }
    for (const failure of scenario.partial_failures) {
      assertNonEmptyString(failure.engine, `${id}.partial_failures.engine`);
      assertNonEmptyString(failure.type, `${id}.partial_failures.type`);
      if (failure.engine !== 'request_budget'
        && !searchedEngines.includes(failure.engine)) {
        throw new Error(`${id} failure engine must be present in searched_engines`);
      }
    }
    assertObject(scenario.quality_gate, `${id}.quality_gate`);
    assertObject(scenario.format, `${id}.format`);
    assertObject(scenario.expected, `${id}.expected`);
  }
  return input;
}

function buildScenarioReport(scenario, securityNote, dependencies) {
  const evaluator = dependencies.createSearchEvidenceEvaluator({
    query: scenario.query,
    engineWeights: scenario.engine_weights,
    qualityGate: scenario.quality_gate,
  });
  const evaluation = evaluator.evaluate(scenario.raw_results);
  const formatted = dependencies.formatResults(evaluation.results, {
    ...scenario.format,
    query: scenario.query,
  });
  const partialFailures = scenario.partial_failures.map(failure => ({ ...failure }));
  const packet = {
    query: scenario.query,
    engines: [...scenario.execution.searched_engines],
    ...formatted,
    meta: {
      ...formatted.meta,
      execution: {
        ...scenario.execution,
        quality_gate: evaluation.qualityGate,
      },
    },
    security_note: securityNote,
    ...(partialFailures.length > 0 ? { partialFailures } : {}),
  };

  if (scenario.execution.stop_reason === 'quality_gate_satisfied'
    && !evaluation.qualityGate.sufficient) {
    throw new Error(`${scenario.id} claims a quality-gate stop with insufficient evidence`);
  }

  const toolResult = dependencies.createSearchToolResult(packet);
  const text = toolResult.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error(`${scenario.id} did not produce a text compatibility view`);
  }
  const structured = toolResult.structuredContent;
  const visibleResults = formatted.results;
  const fullResults = visibleResults.filter(result => result.compacted !== true);
  const allUrlsInText = visibleResults.every(result => text.includes(result.url));
  const sourceSignalInText = fullResults.every(result => (
    result.source_count === undefined
    || text.includes(`provider_families=${result.source_count}`)
  ));
  const partialFailuresInText = partialFailures.every(failure => (
    text.includes(`${failure.engine}:${failure.type}`)
  ));
  const textTokens = tokenCount(text);
  const structuredTokens = tokenCount(structured);

  return {
    id: scenario.id,
    title: scenario.title,
    result_count: visibleResults.length,
    top_result: visibleResults[0]
      ? {
        url: visibleResults[0].url,
        sources: visibleResults[0].sources ?? [],
        provider_family_count: visibleResults[0].source_count ?? null,
      }
      : null,
    quality_gate: evaluation.qualityGate,
    execution: { ...scenario.execution },
    skipped_engines: [...(scenario.skipped_engines ?? [])],
    partial_failures: partialFailures.map(({ engine, type }) => ({ engine, type })),
    compacted_count: formatted.meta.compacted_count ?? 0,
    evidence_budget: formatted.meta.evidence_budget ?? null,
    tool_views: {
      text,
      text_tokens: textTokens,
      structured_tokens: structuredTokens,
      text_savings_percent: structuredTokens === 0
        ? 0
        : round((1 - textTokens / structuredTokens) * 100),
    },
    provenance_checks: {
      all_urls_in_text: allUrlsInText,
      source_signal_in_text: sourceSignalInText,
      partial_failures_in_text: partialFailuresInText,
      structured_content_is_canonical: structured === packet,
    },
  };
}

/**
 * Replay synthetic evidence through production scoring, formatting, and MCP
 * output helpers. No engine, subprocess, model, or network adapter is invoked.
 */
export function buildEvidenceDemoReport(fixture, dependencies) {
  const input = validateFixture(fixture);
  for (const name of [
    'createSearchEvidenceEvaluator',
    'createSearchToolResult',
    'formatResults',
  ]) {
    if (typeof dependencies?.[name] !== 'function') {
      throw new Error(`dependencies.${name} must be a function`);
    }
  }

  return {
    schema_version: 1,
    kind: REPORT_KIND,
    fixture_sha256: sha256(JSON.stringify(input)),
    claim_scope: input.claim_scope,
    quality_claim_eligible: false,
    security_note: input.security_note,
    scenarios: input.scenarios.map(scenario => (
      buildScenarioReport(scenario, input.security_note, dependencies)
    )),
  };
}

function assertExpected(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} drifted: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/** Verify the checked-in demo remains aligned with its preregistered claims. */
export function verifyEvidenceDemoReport(report, fixture) {
  const input = validateFixture(fixture);
  if (report.kind !== REPORT_KIND || report.quality_claim_eligible !== false) {
    throw new Error('invalid evidence demo report boundary');
  }
  if (report.fixture_sha256 !== sha256(JSON.stringify(input))) {
    throw new Error('evidence demo fixture hash mismatch');
  }

  for (const scenario of input.scenarios) {
    const actual = report.scenarios.find(item => item.id === scenario.id);
    if (!actual) throw new Error(`missing evidence demo scenario: ${scenario.id}`);
    const expected = scenario.expected;
    assertExpected(actual.result_count, expected.result_count, `${scenario.id}.result_count`);
    assertExpected(
      actual.top_result?.provider_family_count ?? null,
      expected.top_result_source_count,
      `${scenario.id}.top_result_source_count`,
    );
    assertExpected(
      actual.quality_gate.sufficient,
      expected.quality_gate_sufficient,
      `${scenario.id}.quality_gate_sufficient`,
    );
    assertExpected(
      actual.partial_failures.map(failure => failure.type),
      expected.partial_failure_types,
      `${scenario.id}.partial_failure_types`,
    );
    assertExpected(
      actual.tool_views.text_tokens,
      expected.text_tokens,
      `${scenario.id}.text_tokens`,
    );
    assertExpected(
      actual.tool_views.structured_tokens,
      expected.structured_tokens,
      `${scenario.id}.structured_tokens`,
    );
    assertExpected(
      actual.tool_views.text_savings_percent,
      expected.text_savings_percent,
      `${scenario.id}.text_savings_percent`,
    );
    if (expected.compacted_count !== undefined) {
      assertExpected(
        actual.compacted_count,
        expected.compacted_count,
        `${scenario.id}.compacted_count`,
      );
    }
    if (expected.skipped_engines !== undefined) {
      assertExpected(
        actual.skipped_engines,
        expected.skipped_engines,
        `${scenario.id}.skipped_engines`,
      );
    }
    if (expected.text_view_smaller_than_structured === true
      && actual.tool_views.text_tokens >= actual.tool_views.structured_tokens) {
      throw new Error(`${scenario.id} text view is not smaller than structured content`);
    }
    if (expected.text_view_preserves_all_urls === true
      && !actual.provenance_checks.all_urls_in_text) {
      throw new Error(`${scenario.id} text view dropped a result URL`);
    }
    if (expected.text_view_preserves_source_signal === true
      && !actual.provenance_checks.source_signal_in_text) {
      throw new Error(`${scenario.id} text view dropped a provider-family signal`);
    }
    if (!actual.provenance_checks.partial_failures_in_text) {
      throw new Error(`${scenario.id} text view dropped a partial failure`);
    }
  }
  return report;
}

/** Render a stable, human-readable one-minute demo for terminal users. */
export function formatEvidenceDemoSummary(report) {
  const lines = [
    'Agent Search Evidence Demo (offline)',
    'Synthetic contract demo; not a live search-quality claim.',
    '',
  ];
  for (const [index, scenario] of report.scenarios.entries()) {
    lines.push(`${index + 1}. ${scenario.title}`);
    lines.push(
      `   results=${scenario.result_count} `
      + `families=${scenario.quality_gate.providerFamilyCount} `
      + `gate=${scenario.quality_gate.sufficient ? 'pass' : 'continue'} `
      + `stop=${scenario.execution.stop_reason}`,
    );
    if (scenario.partial_failures.length > 0) {
      lines.push(
        `   failures=${scenario.partial_failures
          .map(failure => `${failure.engine}:${failure.type}`)
          .join(',')}`,
      );
    }
    if (scenario.skipped_engines.length > 0) {
      lines.push(`   skipped=${scenario.skipped_engines.join(',')}`);
    }
    lines.push(
      `   text=${scenario.tool_views.text_tokens} tokens; `
      + `structured=${scenario.tool_views.structured_tokens} tokens; `
      + `text view saves ${scenario.tool_views.text_savings_percent}%`,
    );
  }
  return lines.join('\n');
}
