/**
 * LLM-as-a-Judge — v2 Benchmark
 * 
 * Uses an LLM to score search results against expected answers.
 * Implements SimpleQA-style CORRECT / INCORRECT / NOT_ATTEMPTED grading.
 * Falls back to substring matching when LLM is unavailable.
 * 
 * Environment variables:
 *   LLM_JUDGE_API_KEY  — API key for the judge LLM
 *   LLM_JUDGE_BASE_URL — API base URL (default: opencode.ai/zen/go/v1)
 *   LLM_JUDGE_MODEL    — Model name (default: deepseek-v4-flash)
 */

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1';
const DEFAULT_MODEL = 'deepseek-v4-flash';

export class LlmJudge {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.LLM_JUDGE_API_KEY || process.env.OPENCODE_API_KEY || '';
    this.baseUrl = opts.baseUrl || process.env.LLM_JUDGE_BASE_URL || DEFAULT_BASE_URL;
    this.model = opts.model || process.env.LLM_JUDGE_MODEL || DEFAULT_MODEL;
  }

  get hasLlmAccess() {
    return !!this.apiKey;
  }

  /**
   * Grade whether search results answer a question (SimpleQA-style).
   * Falls back to substring matching when LLM is unavailable.
   */
  async grade(question, expected, results) {
    const topResults = (results || []).slice(0, 5);
    const resultText = topResults.map((r, i) =>
      `[${i + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`
    ).join('\n\n');

    // Fallback: substring matching when no LLM API key
    if (!this.hasLlmAccess && expected) {
      const expectedLower = expected.toLowerCase();
      const found = topResults.some(r =>
        (r.title || '').toLowerCase().includes(expectedLower) ||
        (r.snippet || '').toLowerCase().includes(expectedLower)
      );
      return {
        verdict: found ? 'CORRECT' : 'NOT_ATTEMPTED',
        reasoning: found ? `Found "${expected}" in results` : `"${expected}" not found in top-5 results`,
      };
    }

    // LLM-based scoring
    const prompt = `You are grading search engine results. Determine if the search results correctly answer the user's question.

Question: ${question}
Expected answer: ${expected}

Search results:
${resultText || '(no results returned)'}

Grade the predicted answer as one of:
- CORRECT: The search results clearly contain the correct answer to the question.
- INCORRECT: The search results contain information that contradicts the expected answer or are clearly wrong.
- NOT_ATTEMPTED: The search results don't contain enough information to determine the answer.

First, briefly explain your reasoning (1-2 sentences). Then output the verdict on a new line as: VERDICT: CORRECT (or INCORRECT or NOT_ATTEMPTED)`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
          temperature: 0.0,
        }),
      });

      if (!response.ok) {
        return { verdict: 'NOT_ATTEMPTED', reasoning: `Judge API error: HTTP ${response.status}` };
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';

      if (text.includes('VERDICT: CORRECT')) return { verdict: 'CORRECT', reasoning: text };
      if (text.includes('VERDICT: INCORRECT')) return { verdict: 'INCORRECT', reasoning: text };
      if (text.includes('VERDICT: NOT_ATTEMPTED')) return { verdict: 'NOT_ATTEMPTED', reasoning: text };

      if (text.toLowerCase().includes('correct')) return { verdict: 'CORRECT', reasoning: text };
      if (text.toLowerCase().includes('incorrect')) return { verdict: 'INCORRECT', reasoning: text };
      return { verdict: 'NOT_ATTEMPTED', reasoning: text };

    } catch (err) {
      return { verdict: 'NOT_ATTEMPTED', reasoning: `Judge error: ${err.message}` };
    }
  }

  /**
   * Rate Chinese search result relevance (1-5 scale).
   */
  async rateChineseRelevance(query, results) {
    const topResults = (results || []).slice(0, 5);
    const resultText = topResults.map((r, i) =>
      `[${i + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`
    ).join('\n\n');

    // Fallback: domain-based scoring when no LLM
    if (!this.hasLlmAccess) {
      const authorityDomains = ['baike.baidu.com', 'zhihu.com', 'csdn.net', 'juejin.cn', 'github.com'];
      const hits = topResults.filter(r => {
        try { const h = new URL(r.url).hostname; return authorityDomains.some(d => h.includes(d)); }
        catch { return false; }
      }).length;
      return { score: Math.min(5, Math.max(1, hits + 1)), reasoning: `Domain-based: ${hits}/${topResults.length} from authority domains` };
    }

    const prompt = `你是一个中文搜索质量评分专家。请评估以下搜索结果对用户中文查询的相关性。

用户查询: ${query}

搜索结果:
${resultText || '(无结果)'}

请输出一个1-5的相关性评分:
5 = 非常相关，内容丰富，来自权威中文站点
4 = 相关，信息有用
3 = 部分相关
2 = 不太相关
1 = 完全不相关或结果为空

先输出一行简要理由，然后新行输出: SCORE: N`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
          temperature: 0.0,
        }),
      });

      if (!response.ok) return { score: 1, reasoning: `API error: ${response.status}` };

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      const match = text.match(/SCORE:\s*(\d)/);
      const score = match ? Math.min(5, Math.max(1, parseInt(match[1]))) : 3;
      return { score, reasoning: text };
    } catch (err) {
      return { score: 1, reasoning: `Error: ${err.message}` };
    }
  }

  /**
   * Grade freshness: are results from the last 7 days?
   * Falls back to simple heuristics when LLM is unavailable.
   */
  async gradeFreshness(query, results) {
    const topResults = (results || []).slice(0, 5);

    // Fallback: look for date patterns in snippets
    if (!this.hasLlmAccess) {
      const currentYear = new Date().getFullYear();
      const datePattern = /\b(202[5-9]|203[0-9])\b/g;
      const hasRecentDate = topResults.some(r => {
        const text = (r.title + ' ' + (r.snippet || ''));
        const dates = text.match(datePattern);
        return dates && dates.some(d => parseInt(d) >= currentYear - 1);
      });
      return {
        fresh: hasRecentDate,
        reasoning: hasRecentDate ? 'Recent date found in results' : 'No recent dates detected',
      };
    }

    const resultText = topResults.map((r, i) =>
      `[${i + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`
    ).join('\n\n');

    const prompt = `Determine if the search results contain CURRENT information (within the last 7 days).

Query: ${query}

Results:
${resultText || '(no results)'}

Output one line only: FRESH or STALE`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
          temperature: 0.0,
        }),
      });

      if (!response.ok) return { fresh: false, reasoning: `API error` };
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      return { fresh: text.includes('FRESH'), reasoning: text };
    } catch (err) {
      return { fresh: false, reasoning: `Error: ${err.message}` };
    }
  }
}
