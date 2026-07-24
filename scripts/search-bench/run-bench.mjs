#!/usr/bin/env node

/**
 * Agent Search MCP — Search Quality Benchmark Runner
 * 
 * Spawns the MCP server as a subprocess, sends queries via JSON-RPC,
 * scores results against curated question sets, and outputs a report.
 * 
 * Usage:
 *   node scripts/search-bench/run-bench.mjs
 *   node scripts/search-bench/run-bench.mjs --json   # JSON output only
 *   node scripts/search-bench/run-bench.mjs --quick  # smaller question set
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const DIST_INDEX = resolve(PROJECT_ROOT, 'dist/index.js');

// ─── question sets ───────────────────────────────────────────────────────
//
// Each question:
//   query        - the search query
//   expected     - substring that should appear in top-K results or their snippets
//   category     - factual | temporal | chinese | multi-source
//   accept_domains - domains that count as quality hits (optional)
//   min_confidence - minimum expected confidence score (optional)

const QUESTIONS = {
  factual: [
    { query: "capital of France", expected: "Paris" },
    { query: "Python programming language creator", expected: "Guido van Rossum" },
    { query: "largest ocean on Earth", expected: "Pacific" },
    { query: "Who wrote Romeo and Juliet", expected: "Shakespeare" },
    { query: "atomic number of hydrogen", expected: "1" },
    { query: "height of Mount Everest in meters", expected: "8848" },
    { query: "boiling point of water in celsius", expected: "100" },
    { query: "currency used in Japan", expected: "yen" },
    { query: "first person on the moon", expected: "Armstrong" },
    { query: "chemical symbol for gold", expected: "Au" },
    { query: "world's longest river", expected: "Nile" },
    { query: "population of the United States 2025", expected: "3" },
    { query: "operating system created by Linus Torvalds", expected: "Linux" },
    { query: "what does HTTP stand for", expected: "Hypertext Transfer" },
    { query: "year World War II ended", expected: "1945" },
    { query: "deepest point in the ocean", expected: "Mariana Trench" },
    { query: "planet known as the Red Planet", expected: "Mars" },
    { query: "largest mammal on Earth", expected: "blue whale" },
    { query: "inventor of the telephone", expected: "Alexander Graham Bell" },
    { query: "national sport of Canada", expected: "lacrosse" },
  ],
  temporal: [
    { query: "latest Python release date 2026", expected: "2026" },
    { query: "current CEO of OpenAI", expected: "" },
    { query: "latest MCP protocol version", expected: "" },
    { query: "latest iPhone release 2026", expected: "" },
    { query: "current US federal funds rate", expected: "" },
    { query: "latest version of Node.js", expected: "" },
    { query: "Apple stock price today", expected: "" },
    { query: "latest news about AI regulation", expected: "" },
    { query: "current weather in Tokyo", expected: "Tokyo" },
    { query: "latest React version", expected: "" },
    { query: "most recent SpaceX launch", expected: "" },
    { query: "current price of Bitcoin", expected: "" },
    { query: "latest Claude model version", expected: "" },
    { query: "MCP 2026 spec update", expected: "" },
    { query: "latest GitHub Copilot features", expected: "" },
  ],
  chinese: [
    { query: "DeepSeek 最新版本", expected: "", accept_domains: ["csdn.net", "zhihu.com", "baike.baidu.com", "oschina.net"] },
    { query: "中国人口数量 2025", expected: "", accept_domains: ["baike.baidu.com", "gov.cn"] },
    { query: "MCP 协议介绍", expected: "", accept_domains: ["csdn.net", "zhihu.com", "juejin.cn"] },
    { query: "人工智能发展趋势", expected: "", accept_domains: ["csdn.net", "36kr.com", "huxiu.com"] },
    { query: "Python 教程", expected: "", accept_domains: ["csdn.net", "zhihu.com", "runoob.com"] },
    { query: "上海迪士尼门票价格", expected: "上海", accept_domains: ["baike.baidu.com"] },
    { query: "清华大学排名", expected: "", accept_domains: ["edu.cn", "baike.baidu.com"] },
    { query: "微信小程序开发文档", expected: "小程序", accept_domains: ["tencent.com", "cloud.tencent.com"] },
    { query: "新能源汽车销量排行", expected: "", accept_domains: ["36kr.com", "huxiu.com", "sohu.com"] },
    { query: "如何学习机器学习", expected: "学习", accept_domains: ["csdn.net", "zhihu.com", "jianshu.com"] },
    { query: "2026 世界杯", expected: "2026", accept_domains: ["baike.baidu.com", "sina.com.cn"] },
    { query: "Vue.js 和 React 区别", expected: "", accept_domains: ["csdn.net", "zhihu.com", "juejin.cn"] },
    { query: "端午节日期 2026", expected: "", accept_domains: ["baike.baidu.com", "gov.cn"] },
    { query: "阿里云服务器价格", expected: "阿里云", accept_domains: ["aliyun.com"] },
    { query: "ChatGPT 中文使用教程", expected: "", accept_domains: ["csdn.net", "zhihu.com", "juejin.cn"] },
  ],
  "multi-source": [
    { query: "MCP server best practices 2026", expected: "" },
    { query: "Tavily API pricing", expected: "" },
    { query: "Firecrawl vs Exa comparison", expected: "" },
    { query: "best AI coding assistant 2026", expected: "" },
    { query: "Claude Code vs Cursor", expected: "" },
    { query: "OpenAI o3 release date", expected: "" },
    { query: "Docker vs Podman", expected: "" },
    { query: "TypeScript 5.5 new features", expected: "" },
    { query: "SSD vs HDD speed comparison", expected: "" },
    { query: "React Server Components explained", expected: "" },
  ],
};

// ─── MCP client (stdio subprocess) ─────────────────────────────────────

class McpClient {
  #proc;
  #id = 0;
  #pending = new Map();
  #buffer = '';

  constructor(path) {
    this.#proc = spawn('node', [path], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LOG_LEVEL: 'silent' },
    });

    this.#proc.stderr.on('data', () => {}); // drain

    this.#proc.stdout.on('data', (chunk) => {
      this.#buffer += chunk.toString();
      const lines = this.#buffer.split('\n');
      this.#buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const { resolve, reject } = this.#pending.get(msg.id) || {};
          if (resolve) {
            this.#pending.delete(msg.id);
            resolve(msg);
          }
        } catch { /* partial JSON, keep buffering */ }
      }
    });
  }

  async notify(method, params = {}) {
    this.#proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', method, params,
    }) + '\n');
  }

  async call(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`MCP call timed out: ${method}`));
      }, 15000);
      this.#pending.set(id, {
        resolve: (r) => { clearTimeout(t); resolve(r); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      this.#proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0', id, method, params,
      }) + '\n');
    });
  }

  async close() {
    this.#proc.kill();
  }
}

// ─── scoring logic ───────────────────────────────────────────────────────

function scoreResponse(question, response) {
  const results = response?.result?.content?.[0]?.text;
  if (!results) {
    return { has_results: false, score: 0, confidence_avg: 0, top3_contains_expected: false, cn_domain_hit: false, details: 'no response' };
  }

  let parsed;
  try {
    parsed = JSON.parse(results);
  } catch {
    return { has_results: false, score: 0, confidence_avg: 0, top3_contains_expected: false, cn_domain_hit: false, details: 'parse failed' };
  }

  const items = parsed.results || [];
  if (items.length === 0) {
    return { has_results: true, score: 0, confidence_avg: 0, top3_contains_expected: false, cn_domain_hit: false, details: 'empty results' };
  }

  const top3 = items.slice(0, 3);
  const confidenceAvg = top3.reduce((s, r) => s + (r.confidence || 0), 0) / Math.max(top3.length, 1);

  // Factual: does top-3 contain expected string?
  let top3Contains = false;
  if (question.expected) {
    const expectedLower = question.expected.toLowerCase();
    top3Contains = top3.some(r =>
      (r.title || '').toLowerCase().includes(expectedLower) ||
      (r.snippet || '').toLowerCase().includes(expectedLower)
    );
  }

  // Chinese: does any top-5 result hit an authority domain?
  let cnDomainHit = false;
  if (question.accept_domains) {
    cnDomainHit = items.slice(0, 5).some(r => {
      try {
        const host = new URL(r.url).hostname;
        return question.accept_domains.some(d => host.includes(d));
      } catch { return false; }
    });
  }

  // Multi-source: what % have confidence >= 2?
  const highConfCount = items.filter(r => (r.confidence || 0) >= 2).length;
  const multiSourceRate = items.length > 0 ? highConfCount / items.length : 0;

  return {
    has_results: true,
    result_count: items.length,
    confidence_avg: Math.round(confidenceAvg * 100) / 100,
    high_confidence_count: highConfCount,
    multi_source_rate: Math.round(multiSourceRate * 100),
    top3_contains_expected: top3Contains,
    cn_domain_hit: cnDomainHit,
    details: `count=${items.length} conf=${Math.round(confidenceAvg*100)}% hiConf=${highConfCount}`,
  };
}

function computeCategoryScore(category, scores) {
  if (scores.length === 0) return { avg_score: 0, pass_rate: 0, n: 0 };

  const withResults = scores.filter(s => s.has_results);
  const resultRate = withResults.length / scores.length;

  let avgConf = 0;
  let factualPass = 0;
  let factualTotal = 0;
  let cnDomainPass = 0;
  let cnDomainTotal = 0;
  let multiSourceRate = 0;

  for (const s of scores) {
    avgConf += s.confidence_avg || 0;
    if (s.top3_contains_expected !== undefined) {
      factualTotal++;
      if (s.top3_contains_expected) factualPass++;
    }
    if (s.cn_domain_hit !== undefined) {
      cnDomainTotal++;
      if (s.cn_domain_hit) cnDomainPass++;
    }
    multiSourceRate += s.multi_source_rate || 0;
  }

  return {
    n: scores.length,
    result_rate: Math.round(resultRate * 100),
    avg_confidence: Math.round((avgConf / scores.length) * 100),
    factual_accuracy: factualTotal > 0 ? Math.round((factualPass / factualTotal) * 100) : null,
    cn_domain_hit_rate: cnDomainTotal > 0 ? Math.round((cnDomainPass / cnDomainTotal) * 100) : null,
    multi_source_rate: Math.round(multiSourceRate / scores.length),
  };
}

// ─── report generator ────────────────────────────────────────────────────

function generateReport(categoryScores, totalTime) {
  const rows = [];

  for (const [cat, info] of Object.entries(categoryScores)) {
    const catLabels = {
      factual: { label: '事实精度', icon: '📚' },
      temporal: { label: '时效新鲜度', icon: '⏱' },
      chinese: { label: '中文搜索', icon: '🇨🇳' },
      'multi-source': { label: '多源验证', icon: '🔗' },
    };
    const meta = catLabels[cat] || { label: cat, icon: '📊' };

    const bars = [
      `结果可搜率: ${info.result_rate}%`,
      `置信度均值: ${info.avg_confidence}%`,
      info.factual_accuracy !== null ? `事实命中率: ${info.factual_accuracy}%` : null,
      info.cn_domain_hit_rate !== null ? `中文权威命中: ${info.cn_domain_hit_rate}%` : null,
      `多源验证率: ${info.multi_source_rate}%`,
    ].filter(Boolean);

    rows.push({
      category: `${meta.icon} ${meta.label}`,
      n: info.n,
      bars: bars.join(' · '),
    });
  }

  let report = `# Agent Search MCP — 搜索质量基准报告\n\n`;
  report += `> **测试时间**: ${new Date().toISOString().slice(0, 16)}\n`;
  report += `> **版本**: ${process.env.npm_package_version || 'v3.1.x'}\n`;
  report += `> **耗时**: ${totalTime.toFixed(1)}s\n`;
  report += `> **总提问**: ${rows.reduce((s, r) => s + r.n, 0)}\n\n`;
  report += `| 维度 | 问题数 | 评分 |\n`;
  report += `|------|:-----:|------|\n`;
  for (const row of rows) {
    report += `| ${row.category} | ${row.n} | ${row.bars} |\n`;
  }

  report += `\n## 综合得分卡\n\n`;
  report += `\`\`\`\n`;
  report += `Agent Search MCP — 搜索质量评分\n`;
  report += `┌──────────────────────┬────────┬────────┐\n`;
  report += `│ 维度                 │ 分数   │ 等级   │\n`;
  report += `├──────────────────────┼────────┼────────┤\n`;

  const grades = [];
  for (const [cat, info] of Object.entries(categoryScores)) {
    const meta = { factual: '事实精度', temporal: '时效新鲜度', chinese: '中文搜索', 'multi-source': '多源验证' };
    const label = meta[cat] || cat;
    // composite score: weighted average
    let composite;
    if (cat === 'factual') {
      composite = Math.round((info.avg_confidence * 0.4 + (info.factual_accuracy || 0) * 0.6));
    } else if (cat === 'temporal') {
      composite = Math.round(info.avg_confidence * 0.5 + info.multi_source_rate * 0.3 + info.result_rate * 0.2);
    } else if (cat === 'chinese') {
      composite = Math.round(info.avg_confidence * 0.3 + (info.cn_domain_hit_rate || 0) * 0.4 + info.result_rate * 0.3);
    } else {
      composite = Math.round(info.avg_confidence * 0.3 + info.multi_source_rate * 0.7);
    }
    const grade = composite >= 85 ? 'A' : composite >= 70 ? 'B' : composite >= 50 ? 'C' : 'D';
    grades.push({ label, score: composite, grade });
    report += `│ ${label.padEnd(20)} │ ${String(composite).padStart(3,' ')}%    │ ${grade}      │\n`;
  }

  report += `└──────────────────────┴────────┴────────┘\n`;
  report += `\`\`\`\n`;

  // Recommendations
  report += `\n## 改进建议\n\n`;
  const weakest = grades.sort((a, b) => a.score - b.score)[0];
  report += `- **最大短板**: "${weakest.label}" (${weakest.score}%) — `;
  if (weakest.label === '时效新鲜度') {
    report += `加入 freshness 参数 + 时域打分。当前搜索引擎缓存可能返回过时结果。\n`;
  } else if (weakest.label === '中文搜索') {
    report += `增加路由到中文引擎的优化逻辑。当前对纯中文 query 的路由策略可以更激进。\n`;
  } else if (weakest.label === '多源验证') {
    report += `瀑布搜索的 phase 2 启动条件可以降低门槛，让付费引擎更早介入交叉验证。\n`;
  } else {
    report += `提高结果置信度评分精度，或扩展更多权威来源。\n`;
  }

  report += `\n- **数据说明**: 本基准测试结果仅供对比参考。分数受网络状况、搜索引擎响应和缓存影响。\n`;

  return report;
}

// ─── main ────────────────────────────────────────────────────────────────

async function main() {
  const isQuick = process.argv.includes('--quick');
  const asJson = process.argv.includes('--json');

  console.error('🔍 Agent Search MCP Benchmark');
  console.error(`   Questions: ${isQuick ? 'quick (30)' : 'full (60)'}`);
  console.error('');

  // Select question subset
  const questionSet = {};
  for (const [cat, qs] of Object.entries(QUESTIONS)) {
    questionSet[cat] = isQuick ? qs.slice(0, qs.length > 10 ? 8 : qs.length) : qs;
  }
  const totalQs = Object.values(questionSet).reduce((s, qs) => s + qs.length, 0);
  console.error(`   Total: ${totalQs} queries`);

  // Verify server exists
  if (!existsSync(DIST_INDEX)) {
    console.error('❌ dist/index.js not found. Run `npm run build` first.');
    process.exit(1);
  }

  const client = new McpClient(DIST_INDEX);
  const startTime = Date.now();

  try {
    // Initialize
    console.error('   Initializing MCP server...');
    const initResp = await client.call('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'search-bench', version: '1.0.0' },
    });
    client.notify('notifications/initialized', {});
    // Small delay for server to process
    await new Promise(r => setTimeout(r, 200));

    const allScores = {};
    let qNum = 0;

    for (const [category, questions] of Object.entries(questionSet)) {
      console.error(`\n   📂 ${category} (${questions.length} questions)`);
      const scores = [];

      for (const question of questions) {
        qNum++;
        process.stdout.write(`\r   [${qNum}/${totalQs}] ${question.query.slice(0, 50)}...`);

        try {
          const resp = await client.call('tools/call', {
            name: 'free_search',
            arguments: {
              query: question.query,
              count: 10,
              language: category === 'chinese' ? 'zh' : 'auto',
            },
          });
          scores.push(scoreResponse(question, resp));
        } catch (err) {
          scores.push({
            has_results: false, score: 0, confidence_avg: 0,
            top3_contains_expected: false, cn_domain_hit: false,
            details: `error: ${err.message}`,
          });
        }

        // Small delay to avoid rate limiting on free engines
        await new Promise(r => setTimeout(r, 300));
      }

      allScores[category] = scores;
      process.stdout.write('\n');
    }

    const elapsed = (Date.now() - startTime) / 1000;
    process.stdout.write('\n');

    // Compute category scores
    const categoryResults = {};
    for (const [cat, scores] of Object.entries(allScores)) {
      categoryResults[cat] = computeCategoryScore(cat, scores);
    }

    // Generate report
    const report = generateReport(categoryResults, elapsed);

    if (asJson) {
      console.log(JSON.stringify(categoryResults, null, 2));
    } else {
      console.log('\n' + report);
    }

    // Save report
    const reportPath = resolve(__dirname, `benchmark-report-${Date.now()}.md`);
    writeFileSync(reportPath, report);
    console.error(`\n   📄 Report saved: ${reportPath}`);

  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
