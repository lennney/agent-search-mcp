const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const QUERIES_FILE = path.join(__dirname, 'queries.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

const queries = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));

// ── Optional tiktoken ─────────────────────────────────────────────────
let tokenCounter;
try {
  // Try Python tiktoken via child process
  const { execSync } = require('child_process');
  execSync('python3 -c "import tiktoken; enc=tiktoken.get_encoding(\"cl100k_base\"); print(enc.encode(\"test\").__len__())"', {
    stdio: 'pipe', timeout: 5000
  });
  tokenCounter = 'tiktoken';
  console.log('Token counter: tiktoken (cl100k_base) ✓');
} catch {
  tokenCounter = 'estimate';
  console.log('Token counter: estimation (~1 token per 3 chars) — install tiktoken for precise counts');
}

function countTokens(text) {
  if (tokenCounter === 'tiktoken') {
    try {
      const { execSync } = require('child_process');
      // Pipe text via stdin to avoid shell escaping issues
      const result = execSync(
        `python3 -c "import sys,tiktoken; enc=tiktoken.get_encoding('cl100k_base'); print(len(enc.encode(sys.stdin.read())))"`,
        { input: text, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }
      );
      return parseInt(result.toString().trim(), 10);
    } catch {
      // Fall back to estimation
    }
  }
  // Character-based estimation: ~1 token per 3 chars for mixed EN+ZH
  return Math.max(1, Math.round(text.length / 3.0));
}

// ── Parse mixed NDJSON + multi-line JSON output ──────────────────────
function parseOutput(raw) {
  // Strategy: find JSON lines that are NOT NDJSON (don't start with {"level")
  // Collect them into a candidate, try to parse as JSON, look for "results"
  const lines = raw.split('\n');
  
  // Remove NDJSON log lines and plain text errors
  const jsonLines = lines.filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith('{"level"')) return false; // NDJSON log
    if (!t.startsWith('{') && !t.startsWith('[') && !t.startsWith('"')) return false; // plain text error
    return true;
  });

  // Try the combined JSON
  const candidate = jsonLines.join('\n');
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && 'results' in parsed) return parsed;
  } catch {
    // Try each bracket-balanced block
    let depth = 0;
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('{"level"')) continue;
      for (const ch of trimmed) {
        if (ch === '{' || ch === '[') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}' || ch === ']') {
          depth--;
          if (depth === 0 && start >= 0) {
            const block = lines.slice(start, i + 1).join('\n');
            try {
              const parsed = JSON.parse(block);
              if (parsed && 'results' in parsed) return parsed;
            } catch {}
            start = -1;
          }
        }
      }
    }
  }
  return null;
}

// ── Run search ────────────────────────────────────────────────────────
function runSearch(query, count, envOverrides) {
  const cliPath = path.join(__dirname, '..', 'dist/cli.js');
  const env = { ...process.env, ...envOverrides };
  const start = Date.now();
  let rawOutput;
  try {
    rawOutput = execFileSync(
      'node', [cliPath, 'search', query, '--count', String(count), '--json'],
      { timeout: 45000, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], env }
    );
  } catch (e) {
    return { success: false, error: e.message, duration: Date.now() - start };
  }
  const duration = Date.now() - start;

  const resultJson = parseOutput(rawOutput);
  if (!resultJson) {
    return { success: false, error: 'parse failed', duration };
  }

  const results = resultJson.results || [];
  if (results.length === 0) {
    return { success: false, error: 'no results (rate limited?)', duration, enginesUsed: resultJson.engines || [] };
  }

  const enginesUsed = resultJson.engines || [];
  const fullJson = JSON.stringify(resultJson);
  const tokenCount = countTokens(fullJson);
  const resultsOnlyJson = JSON.stringify(results);
  
  const confidenceScores = results.map(r => r.confidence).filter(c => c != null);
  const urls = results.map(r => r.url).filter(Boolean);

  return {
    success: true,
    duration,
    resultsCount: results.length,
    enginesUsed,
    enginesCount: enginesUsed.length,
    responseBytes: Buffer.byteLength(fullJson, 'utf-8'),
    responseChars: fullJson.length,
    tokenCount,
    avgConfidence: confidenceScores.length > 0
      ? parseFloat((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(2))
      : 0,
    totalUrls: urls.length,
    uniqueUrls: new Set(urls).size,
  };
}

// ── Run all queries for one scenario ──────────────────────────────────
function runScenario(label, envOverrides) {
  const results = [];
  let successCount = 0, totalEngines = 0, totalTokens = 0, totalDuration = 0, waterfallPhase1 = 0;
  const confidences = [];
  const timings = [];

  console.log(`\n=== ${label} ===`);
  console.log(`    Config: ${Object.entries(envOverrides).map(([k,v]) => `${k}=${v}`).join(', ') || 'default'}`);

  for (const [i, q] of queries.entries()) {
    const r = runSearch(q.q, 10, envOverrides);
    results.push(r);
    
    if (r.success) {
      successCount++;
      totalEngines += r.enginesCount;
      totalTokens += r.tokenCount;
      totalDuration += r.duration;
      timings.push(r.duration);
      if (r.avgConfidence > 0) confidences.push(r.avgConfidence);
      if (r.enginesCount <= 2) waterfallPhase1++;
      
      const pct = ((i + 1) / queries.length * 100).toFixed(0);
      console.log(`  [${i + 1}/${queries.length}] ${pct}% ✓ ${r.enginesCount}eng ${r.tokenCount}tk ${r.duration}ms`);
    } else {
      console.log(`  [${i + 1}/${queries.length}] ✗ ${r.error}`);
    }
  }

  // Latency percentiles
  timings.sort((a, b) => a - b);
  const p50 = timings.length > 0 ? timings[Math.floor(timings.length * 0.5)] : 0;
  const p95 = timings.length > 0 ? timings[Math.floor(timings.length * 0.95)] : 0;

  return {
    label,
    total: queries.length,
    successCount,
    successRate: ((successCount / queries.length) * 100).toFixed(1) + '%',
    avgEngines: successCount > 0 ? (totalEngines / successCount).toFixed(1) : '0',
    waterfallPhase1Rate: successCount > 0 ? ((waterfallPhase1 / successCount) * 100).toFixed(0) + '%' : '0%',
    avgTokens: successCount > 0 ? Math.round(totalTokens / successCount) : 0,
    totalTokens,
    avgDuration: successCount > 0 ? Math.round(totalDuration / successCount) + 'ms' : '0ms',
    p50: p50 + 'ms',
    p95: p95 + 'ms',
    avgConfidence: confidences.length > 0
      ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(2)
      : '0.00',
    results,
  };
}

// ── Main ──────────────────────────────────────────────────────────────
console.log('=== Agent Search MCP Benchmark ===');
console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
console.log(`Queries: ${queries.length} (${queries.filter(q => q.lang === 'en').length} EN + ${queries.filter(q => q.lang === 'zh').length} ZH)`);

// 3 scenarios
const normal = runScenario('Normal (waterfall, default)', {});
const compact = runScenario('Compact (progressive disclosure)', {
  OUTPUT_STYLE: 'compact',
  MAX_FULL_RESULTS: '3',
});
const compactAggressive = runScenario('Compact Aggressive (short snippets)', {
  OUTPUT_STYLE: 'compact',
  MAX_FULL_RESULTS: '3',
  SNIPPET_LENGTH: '120',
});

// ── Comparison ────────────────────────────────────────────────────────
console.log('\n');
console.log('═══════════════════════════════════════════════════════');
console.log('               COMPARISON SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

const scenarios = [normal, compact, compactAggressive];
const h = (s, w) => String(s).padStart(w);

console.log(`${'Metric'.padEnd(28)} ${h('Normal', 14)} ${h('Compact', 14)} ${h('Compact+', 14)}`);
console.log('─'.repeat(72));

const printRow = (label, getVal) => {
  const vals = scenarios.map(s => getVal(s));
  console.log(`${label.padEnd(28)} ${h(vals[0], 14)} ${h(vals[1], 14)} ${h(vals[2], 14)}`);
};

printRow('Success rate', s => s.successRate);
printRow('Avg engines/query', s => s.avgEngines);
printRow('Waterfall phase 1', s => s.waterfallPhase1Rate);
printRow('Avg tokens', s => String(s.avgTokens));
printRow('Avg latency', s => s.avgDuration);
printRow('P50 latency', s => s.p50);
printRow('P95 latency', s => s.p95);
printRow('Avg confidence', s => s.avgConfidence);

const normalTokens = normal.avgTokens;
const compactSavings = normalTokens > 0 ? ((1 - compact.avgTokens / normalTokens) * 100).toFixed(1) : '0.0';
const aggressiveSavings = normalTokens > 0 ? ((1 - compactAggressive.avgTokens / normalTokens) * 100).toFixed(1) : '0.0';

console.log('');
console.log(`Token savings vs Normal (${tokenCounter}):`);
console.log(`  Compact:            ${compactSavings}% (${normalTokens} → ${compact.avgTokens} tokens)`);
console.log(`  Compact Aggressive: ${aggressiveSavings}% (${normalTokens} → ${compactAggressive.avgTokens} tokens)`);

const waterfallSavings = normal.avgEngines > 0 ? ((1 - parseFloat(normal.avgEngines) / 8) * 100).toFixed(0) : '0';
console.log(`\nWaterfall engine savings: ${waterfallSavings}% (${normal.avgEngines}/8 engines per query)`);

// ── Save ──────────────────────────────────────────────────────────────
const date = new Date().toISOString().split('T')[0];

const jsonReport = {
  date, queries: queries.length, tokenCounter,
  scenarios: {}
};
for (const s of scenarios) {
  jsonReport.scenarios[s.label] = {
    successRate: s.successRate, avgEngines: s.avgEngines,
    waterfallPhase1Rate: s.waterfallPhase1Rate, avgTokens: s.avgTokens,
    avgDuration: s.avgDuration, p50: s.p50, p95: s.p95, avgConfidence: s.avgConfidence,
  };
}
jsonReport.compactTokenSavings = compactSavings + '%';
jsonReport.compactAggressiveTokenSavings = aggressiveSavings + '%';
jsonReport.waterfallEngineSavings = waterfallSavings + '%';

fs.writeFileSync(path.join(REPORTS_DIR, `${date}.json`), JSON.stringify(jsonReport, null, 2));

// Markdown
const md = `# Benchmark Report — ${date}

Token counter: **${tokenCounter}**

## Results (${queries.length} queries: ${queries.filter(q => q.lang === 'en').length} EN + ${queries.filter(q => q.lang === 'zh').length} ZH)

| Metric | Normal | Compact | Compact Aggressive |
|--------|--------|---------|-------------------|
| Success rate | ${normal.successRate} | ${compact.successRate} | ${compactAggressive.successRate} |
| Avg engines/query | ${normal.avgEngines} | ${compact.avgEngines} | ${compactAggressive.avgEngines} |
| Waterfall phase 1 | ${normal.waterfallPhase1Rate} | ${compact.waterfallPhase1Rate} | ${compactAggressive.waterfallPhase1Rate} |
| Avg tokens | ${normal.avgTokens} | ${compact.avgTokens} | ${compactAggressive.avgTokens} |
| Avg latency | ${normal.avgDuration} | ${compact.avgDuration} | ${compactAggressive.avgDuration} |
| P50 latency | ${normal.p50} | ${compact.p50} | ${compactAggressive.p50} |
| P95 latency | ${normal.p95} | ${compact.p95} | ${compactAggressive.p95} |
| Avg confidence | ${normal.avgConfidence} | ${compact.avgConfidence} | ${compactAggressive.avgConfidence} |

## Token Savings

| Comparison | Savings |
|------------|---------|
| Compact vs Normal | **${compactSavings}%** |
| Compact Aggressive vs Normal | **${aggressiveSavings}%** |
| Waterfall vs naive 8-engine | **${waterfallSavings}% fewer calls** |

## Configuration

| Scenario | OUTPUT_STYLE | MAX_FULL_RESULTS | SNIPPET_LENGTH |
|----------|-------------|-----------------|----------------|
| Normal | (default) | — | 200 |
| Compact | compact | 3 | 200 |
| Compact Aggressive | compact | 3 | 120 |
`;

fs.writeFileSync(path.join(REPORTS_DIR, `${date}.md`), md);

console.log(`\nReports: reports/${date}.json, reports/${date}.md`);
console.log('✓ Done.');
