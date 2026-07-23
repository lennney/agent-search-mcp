const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const QUERIES_FILE = path.join(__dirname, 'queries.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

const queries = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));

/**
 * Parse the mixed NDJSON+JSON output from fasm.
 * Log lines are single-line JSON objects. The final result is a multi-line JSON object.
 * Strategy: find the last occurrence of a root JSON object by bracket matching.
 */
function parseOutput(raw) {
  // Remove NDJSON log lines (single-line JSON objects that don't contain 'results')
  // We want the last JSON blob that has a "results" array
  const lines = raw.split('\n');
  
  // Find the start of the result JSON: look for a line that starts with "{" after log lines end
  let resultLines = [];
  let inResult = false;
  let braceDepth = 0;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    // Count braces to find top-level JSON
    for (const ch of trimmed) {
      if (ch === '}') braceDepth--;
      else if (ch === '{') braceDepth++;
    }
    resultLines.unshift(lines[i]);
    if (braceDepth === 0 && resultLines.length > 1) {
      // Found a complete JSON object
      const candidate = resultLines.join('\n');
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.results) {
          return parsed;
        }
      } catch {
        // not valid JSON, continue searching
      }
      break;
    }
  }
  
  // Try another approach: find by scanning forward
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('{') && !lines[i].includes('"level"')) {
      const candidate = lines.slice(i).join('\n');
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.results) {
          return parsed;
        }
      } catch {}
    }
  }
  
  return null;
}

function runSearch(query, count = 10, compact = false) {
  const cliPath = path.join(__dirname, '..', 'dist/cli.js');
  const env = { ...process.env };
  if (compact) {
    env.OUTPUT_STYLE = 'compact';
  }
  const start = Date.now();
  let rawOutput;
  try {
    rawOutput = execFileSync(
      'node', [cliPath, 'search', query, '--count', String(count), '--json'],
      { timeout: 30000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'], env }
    );
  } catch (e) {
    return { success: false, error: e.message, duration: Date.now() - start };
  }
  const duration = Date.now() - start;

  const resultJson = parseOutput(rawOutput);
  if (!resultJson) {
    return { success: false, error: 'no result JSON found', duration, raw: rawOutput.slice(0, 500) };
  }

  // Extract log lines for per-engine latency
  const engineLatencies = [];
  for (const line of rawOutput.split('\n')) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.engine && typeof parsed.latency === 'number') {
        engineLatencies.push({ engine: parsed.engine, latency: parsed.latency });
      }
    } catch {}
  }

  const results = resultJson.results || [];
  const confidenceScores = results.map(r => r.confidence).filter(c => c != null);
  const urls = results.map(r => r.url).filter(Boolean);

  // Token savings: compare our compressed JSON output to estimated raw SERP size
  const compressedChars = JSON.stringify(results).length;
  const estimatedRawChars = results.reduce((sum, r) => {
    // Raw search result: title + url + full snippet (~300 chars)
    return sum + (r.title || '').length + (r.url || '').length + 300;
  }, 0);
  const tokenRatio = estimatedRawChars > 0
    ? ((1 - compressedChars / estimatedRawChars) * 100).toFixed(1)
    : '0.0';

  return {
    success: true,
    duration,
    resultsCount: results.length,
    enginesUsed: resultJson.engines || [],
    enginesCount: (resultJson.engines || []).length,
    engineLatencies,
    confidenceScores,
    avgConfidence: confidenceScores.length > 0
      ? (confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(2)
      : '0.00',
    urls,
    totalUrls: urls.length,
    uniqueUrls: new Set(urls).size,
    overlapCount: urls.length - new Set(urls).size,
    compressedChars,
    estimatedRawChars,
    tokenRatio: parseFloat(tokenRatio),
    rawResponseSize: rawOutput.length,
  };
}

console.log('=== Agent Search MCP Benchmark ===');
console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
console.log(`Queries: ${queries.length}`);
console.log('');

// ── Run comparison: normal vs compact ──────────────────────────────────
console.log('=== Normal mode ===');
let normalTotal = 0, normalOk = 0;
for (const [i, q] of queries.entries()) {
  process.stdout.write(`  [${i + 1}/${queries.length}] "${q.q.slice(0, 40)}..." `);
  const r = runSearch(q.q, 10, false);
  if (r.success) { normalOk++; normalTotal += r.rawResponseSize || 0; console.log(`✓ ${r.rawResponseSize}B`); }
  else { console.log(`✗ ${r.error}`); }
}

console.log('');
console.log('=== Compact mode ===');
let compactTotal = 0, compactOk = 0;
for (const [i, q] of queries.entries()) {
  process.stdout.write(`  [${i + 1}/${queries.length}] "${q.q.slice(0, 40)}..." `);
  const r = runSearch(q.q, 10, true);
  if (r.success) { compactOk++; compactTotal += r.rawResponseSize || 0; console.log(`✓ ${r.rawResponseSize}B`); }
  else { console.log(`✗ ${r.error}`); }
}

console.log('');
console.log('=== Comparison ===');
const avgNormal = normalOk > 0 ? (normalTotal / normalOk).toFixed(0) : '0';
const avgCompact = compactOk > 0 ? (compactTotal / compactOk).toFixed(0) : '0';
const savings = normalTotal > 0 ? ((1 - compactTotal / normalTotal) * 100).toFixed(1) : '0.0';
console.log(`Normal avg response:  ${avgNormal} bytes`);
console.log(`Compact avg response: ${avgCompact} bytes`);
console.log(`Total savings:        ${savings}% (${normalTotal} → ${compactTotal} bytes over ${normalOk} queries)`);

// Save report
const report = {
  date: new Date().toISOString().split('T')[0],
  queries: queries.length,
  normalModeAvgBytes: parseInt(avgNormal),
  compactModeAvgBytes: parseInt(avgCompact),
  totalBytesNormal: normalTotal,
  totalBytesCompact: compactTotal,
  savingsPercent: parseFloat(savings),
  queriesCompleted: normalOk,
};

const reportPath = path.join(REPORTS_DIR, `${report.date}-comparison.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nComparison report saved: ${reportPath}`);
