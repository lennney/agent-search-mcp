#!/usr/bin/env node

/**
 * mcp-bench v2 — Internal Benchmark Runner
 * 
 * Tests any MCP server's search quality using LLM-as-a-Judge scoring.
 * 
 * Usage:
 *   # Test agent-search-mcp (stdio)
 *   node scripts/search-bench/v2/index.mjs --cmd "node dist/index.js" --runs 4
 * 
 *   # Quick test (30 questions, 1 run)
 *   node scripts/search-bench/v2/index.mjs --cmd "node dist/index.js" --quick
 * 
 *   # Test HTTP server (requires API key)
 *   node scripts/search-bench/v2/index.mjs --url "https://mcp.exa.ai/mcp" --apikey xxx
 * 
 * Internal version: 2.0.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { McpClient } from './lib/mcp-client.mjs';
import { LlmJudge } from './lib/llm-judge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const QUESTIONS_DIR = resolve(__dirname, 'questions');

// ─── CLI parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { runs: 1, quick: false, json: false, save: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cmd': opts.cmd = args[++i]; break;
      case '--url': opts.url = args[++i]; break;
      case '--apikey': opts.apiKey = args[++i]; break;
      case '--runs': opts.runs = parseInt(args[++i]) || 1; break;
      case '--quick': opts.quick = true; break;
      case '--json': opts.json = true; break;
      case '--save': opts.save = true; break;
      case '--help':
        console.log(`
mcp-bench v2 — 通用 MCP 搜索质量测试框架
Usage:
  --cmd "command"   测试 stdio MCP 服务器
  --url "https://..." 测试 HTTP remote MCP
  --apikey KEY      API key (for HTTP mode or paid engines)
  --runs N          每问题重复 N 次 (pass@k) [默认: 1]
  --quick           快速模式 (30 题)
  --json            JSON 输出
  --save            保存结果到文件
  --help            帮助
        `);
        process.exit(0);
    }
  }

  if (!opts.cmd && !opts.url) {
    // Default: test agent-search-mcp from repo
    opts.cmd = `node ${resolve(__dirname, '../../../dist/index.js')}`;
  }

  return opts;
}

// ─── Question loader ─────────────────────────────────────────────────────

function loadQuestions(quick = false) {
  const categories = ['factual', 'temporal', 'chinese'];
  const all = {};

  for (const cat of categories) {
    const path = resolve(QUESTIONS_DIR, `${cat}.json`);
    if (!existsSync(path)) {
      console.error(`  ⚠️  Question set not found: ${cat}.json`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    all[cat] = quick ? data.questions.slice(0, 10) : data.questions;
  }

  return all;
}

// ─── Search runner ───────────────────────────────────────────────────────

async function runSearch(client, question, opts) {
  try {
    const extraParams = {};
    // For Chinese queries, hint language preference
    if (question.authority_domains || /[\u4e00-\u9fff]/.test(question.query)) {
      extraParams.language = 'zh';
    }
    const result = await client.search(question.query, 10, extraParams);
    return { success: true, raw: result.raw, tool: result.tool };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function parseResults(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    // Multiple possible response shapes
    const items = parsed.results || parsed.data?.results || [];
    if (Array.isArray(items)) return items;
    // Some servers return different structures
    return [];
  } catch {
    return [];
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.error(`\n🔍 mcp-bench v2 — ${opts.cmd ? 'STDIO' : 'HTTP'} mode, ${opts.runs} run(s)`);
  console.error(`   LLM Judge: ${process.env.LLM_JUDGE_MODEL || 'deepseek-v4-flash'}`);
  
  // Load questions
  const allQuestions = loadQuestions(opts.quick);
  const totalQs = Object.values(allQuestions).reduce((s, qs) => s + qs.length, 0) * opts.runs;
  console.error(`   Questions: ${totalQs} (${opts.runs} run(s) each)`);

  // Connect to MCP server
  console.error('   Connecting to MCP server...');
  const client = opts.cmd
    ? await McpClient.connect({ cmd: opts.cmd })
    : await McpClient.connect({ url: opts.url, apiKey: opts.apiKey });

  // Initialize judge
  const judge = new LlmJudge({
    apiKey: opts.apiKey || process.env.OPENCODE_API_KEY,
  });

  const startTime = Date.now();
  const results = {};
  let qNum = 0;

  try {
    // List and show tools
    const tools = await client.listTools();
    const searchTool = await client.findSearchTool();
    console.error(`   Tools: ${tools.length} available, using "${searchTool?.name || 'auto-detect'}"`);

    // Sequential: first list tools, then run
    for (const [category, questions] of Object.entries(allQuestions)) {
      console.error(`\n   📂 ${category} (${questions.length} questions × ${opts.runs} runs)`);
      const catResults = [];

      for (const question of questions) {
        const runResults = [];

        for (let run = 0; run < opts.runs; run++) {
          qNum++;
          process.stdout.write(`\r   [${qNum}/${totalQs}] ${question.query.slice(0, 45)}...`);

          const searchResult = await runSearch(client, question, opts);
          runResults.push(searchResult);

          // Small delay between runs
          if (opts.runs > 1) await new Promise(r => setTimeout(r, 200));
        }

        // Score best attempt
        const best = runResults.find(r => r.success) || runResults[0];
        const parsedResults = best.success ? parseResults(best.raw) : [];
        const hasResults = parsedResults.length > 0;

        // LLM scoring for factual questions
        let grade = { verdict: 'NOT_ATTEMPTED', reasoning: 'no results' };
        if (hasResults && question.expected) {
          grade = await judge.grade(question.query, question.expected, parsedResults);
        } else if (hasResults && !question.expected) {
          // For questions without expected answer (temporal), rate freshness
          const freshness = await judge.gradeFreshness(question.query, parsedResults);
          grade = {
            verdict: freshness.fresh ? 'CORRECT' : 'INCORRECT',
            reasoning: freshness.reasoning,
          };
        }

        // Chinese authority domain checking
        let cnDomainHit = false;
        if (question.authority_domains && parsedResults.length > 0) {
          cnDomainHit = parsedResults.slice(0, 5).some(r => {
            try {
              const host = new URL(r.url).hostname;
              return question.authority_domains.some(d => host.includes(d));
            } catch { return false; }
          });
        }

        // Count how many runs succeeded
        const successCount = runResults.filter(r => r.success).length;

        catResults.push({
          question_id: question.id,
          query: question.query,
          result_count: parsedResults.length,
          has_results: hasResults,
          verdict: grade.verdict,
          reasoning: grade.reasoning,
          cn_domain_hit: cnDomainHit,
          runs_successful: successCount,
          total_runs: opts.runs,
          pass_all: successCount === opts.runs,
        });

        // Rate limit avoidance
        await new Promise(r => setTimeout(r, 150));
      }

      results[category] = catResults;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // ─── Compute scores ──────────────────────────────────────────────

    const categoryScores = {};
    for (const [cat, items] of Object.entries(results)) {
      const n = items.length;
      if (n === 0) continue;

      const pass1 = items.filter(i => i.verdict === 'CORRECT').length;
      const notAttempted = items.filter(i => i.verdict === 'NOT_ATTEMPTED' || !i.has_results).length;
      const hasResults = items.filter(i => i.has_results).length;

      // pass@k metrics
      const pass_at_1 = Math.round(pass1 / n * 100);
      const pass_at_4 = items.some(i => i.verdict === 'CORRECT') ? 'N/A' : 'N/A'; // simplified for single run
      const pass_all = items.filter(i => i.pass_all).length;

      // Chinese-specific
      const cnHits = items.filter(i => i.cn_domain_hit).length;

      categoryScores[cat] = {
        questions: n,
        has_results_rate: Math.round(hasResults / n * 100),
        pass_at_1: pass_at_1,
        pass_all_rate: Math.round(pass_all / n * 100),
        cn_domain_hit_rate: cat === 'chinese' ? Math.round(cnHits / n * 100) : null,
      };
    }

    // ─── Build report ────────────────────────────────────────────────

    const reportLines = [];
    reportLines.push(`# mcp-bench v2 — 搜索质量报告\n`);
    reportLines.push(`| 维度 | 问题数 | 可搜率 | pass@1 | pass^r | 中文权威 |`);
    reportLines.push(`|------|:-----:|:------:|:------:|:------:|:--------:|`);

    for (const [cat, s] of Object.entries(categoryScores)) {
      const labels = { factual: '📚 事实精度', temporal: '⏱ 时效新鲜度', chinese: '🇨🇳 中文搜索' };
      const label = labels[cat] || cat;
      reportLines.push(
        `| ${label} | ${s.questions} | ${s.has_results_rate}% | ${s.pass_at_1}% | ${s.pass_all_rate}% | ${s.cn_domain_hit_rate !== null ? s.cn_domain_hit_rate + '%' : '—'} |`
      );
    }

    reportLines.push(`\n*测试时间: ${new Date().toISOString().slice(0, 16)} | 耗时: ${elapsed}s | runs: ${opts.runs}*`);

    if (opts.json) {
      const output = {
        version: '2.0',
        server: opts.cmd || opts.url,
        timestamp: new Date().toISOString(),
        elapsed_seconds: parseFloat(elapsed),
        runs: opts.runs,
        scores: categoryScores,
        raw: results,
      };
      
      if (opts.save) {
        const outPath = resolve(__dirname, `bench-report-${Date.now()}.json`);
        writeFileSync(outPath, JSON.stringify(output, null, 2));
        console.error(`\n   💾 Saved: ${outPath}`);
      }
      
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('\n' + reportLines.join('\n'));
      
      if (opts.save) {
        const outPath = resolve(__dirname, `bench-report-${Date.now()}.md`);
        writeFileSync(outPath, reportLines.join('\n'));
        console.error(`\n   💾 Saved: ${outPath}`);
      }
    }

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('\n❌ Benchmark failed:', err.message);
  process.exit(1);
});
