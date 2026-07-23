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

function runSearch(query, count = 10) {
  const cliPath = path.join(__dirname, '..', 'dist/cli.js');
  const start = Date.now();
  let rawOutput;
  try {
    rawOutput = execFileSync(
      'node', [cliPath, 'search', query, '--count', String(count), '--json'],
      { timeout: 30000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
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
  };
}

console.log('=== Agent Search MCP Benchmark ===');
console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
console.log(`Queries: ${queries.length}`);
console.log('');

const allResults = [];
let successCount = 0;
let failCount = 0;
const allLatencies = [];
const allResultsCounts = [];
const allEngineCounts = [];
const allConfidences = [];
let totalCompressed = 0;
let totalEstimatedRaw = 0;
let totalOverlaps = 0;
let totalUrls = 0;

for (const [i, q] of queries.entries()) {
  process.stdout.write(`  [${i + 1}/${queries.length}] "${q.q.slice(0, 40)}..." `);
  const result = runSearch(q.q);
  
  if (result.success) {
    successCount++;
    allLatencies.push(result.duration);
    allResultsCounts.push(result.resultsCount);
    allEngineCounts.push(result.enginesCount);
    allConfidences.push(...result.confidenceScores);
    totalCompressed += result.compressedChars;
    totalEstimatedRaw += result.estimatedRawChars;
    totalOverlaps += result.overlapCount;
    totalUrls += result.totalUrls;
    console.log(`✓ ${result.resultsCount} results, ${result.enginesCount} engines, ${result.duration}ms`);
  } else {
    failCount++;
    console.log(`✗ ${result.error}`);
  }
  
  allResults.push(result);
}

// ---- Stats ----
const sortedLat = [...allLatencies].sort((a, b) => a - b);
const p50 = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.5)] : 0;
const p95 = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length * 0.95)] : 0;
const avgLat = allLatencies.length > 0 ? (allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length).toFixed(0) : '0';
const avgResults = allResultsCounts.length > 0 ? (allResultsCounts.reduce((a, b) => a + b, 0) / allResultsCounts.length).toFixed(1) : '0';
const avgEngines = allEngineCounts.length > 0 ? (allEngineCounts.reduce((a, b) => a + b, 0) / allEngineCounts.length).toFixed(1) : '0';
const avgConf = allConfidences.length > 0
  ? (allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length).toFixed(2)
  : '0.00';
const totalTokenSave = totalEstimatedRaw > 0
  ? ((1 - totalCompressed / totalEstimatedRaw) * 100).toFixed(1)
  : '0.0';

// Waterfall efficiency: count queries that stopped early (≤2 engines)
const phase1Only = allResults.filter(r => r.success && r.enginesCount <= 2).length;
const phase2More = allResults.filter(r => r.success && r.enginesCount > 2).length;

// Dedup rate
const dedupRate = totalUrls > 0 ? ((totalOverlaps / totalUrls) * 100).toFixed(1) : '0.0';

console.log('');
console.log('=== Summary ===');
console.log(`Date:               ${new Date().toISOString().split('T')[0]}`);
console.log(`Success rate:       ${successCount}/${queries.length} (${(successCount/queries.length*100).toFixed(0)}%)`);
console.log(`Avg latency:        ${avgLat}ms (P50: ${p50}ms, P95: ${p95}ms)`);
console.log(`Avg results/query:  ${avgResults}`);
console.log(`Avg engines/query:  ${avgEngines}`);
console.log(`  Waterfall saved:  ${phase1Only}/${successCount} queries stopped at phase 1 (≤2 engines)`);
console.log(`Avg confidence:     ${avgConf} (scale 0-1)`);
console.log(`Dedup rate:         ${dedupRate}% duplicates removed`);
console.log(`Token savings:      ~${totalTokenSave}% vs raw SERP (title + URL + 300ch snippet)`);

// Save JSON report
const report = {
  date: new Date().toISOString().split('T')[0],
  queries: queries.length,
  successRate: `${(successCount/queries.length*100).toFixed(0)}%`,
  avgLatency: `${avgLat}ms`,
  p50: `${p50}ms`,
  p95: `${p95}ms`,
  avgResults: parseFloat(avgResults),
  avgEngines: parseFloat(avgEngines),
  waterfallSavedQueries: `${phase1Only}/${successCount}`,
  avgConfidence: parseFloat(avgConf),
  dedupRate: `${dedupRate}%`,
  tokenSavings: `~${totalTokenSave}%`,
  queryCount: queries.length,
  successCount,
};

const reportPath = path.join(REPORTS_DIR, `${report.date}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport saved: ${reportPath}`);
