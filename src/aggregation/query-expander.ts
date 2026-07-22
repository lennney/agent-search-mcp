const STOP_WORDS = new Set([
  "how", "what", "why", "when", "where", "which",
  "the", "a", "an", "is", "are", "was", "were",
  "best", "top", "good", "great",
]);

const TECH_SYNONYMS: Record<string, string[]> = {
  js: ["javascript"],
  ts: ["typescript"],
  ai: ["artificial intelligence", "machine learning"],
  ml: ["machine learning"],
  mcp: ["model context protocol"],
  api: ["api", "rest api"],
  ui: ["user interface"],
  ux: ["user experience"],
};

/**
 * 生成备选搜索查询, 最多 2 个。
 * 纯规则, 无 LLM 依赖。
 * 策略:
 * 1. "vs" 拆查询 → "Next.js vs Remix" → ["Next.js", "Remix"]
 * 2. 去前缀 → "how to build MCP" → "MCP"
 * 3. 提取核心词 → "best TypeScript framework" → "TypeScript framework"
 * 4. 技术同义词 → "JS framework" → "javascript framework"
 */
export function expandQuery(query: string): string[] {
  if (!query || query.length < 3) return [];

  const alternatives: string[] = [];

  // 策略1: "vs" 拆查询
  if (query.includes(" vs ") || query.includes(" versus ")) {
    const parts = query.split(/\s+(?:vs|versus)\s+/i);
    if (parts.length >= 2) {
      alternatives.push(parts[0].trim());
      alternatives.push(parts[1].trim());
    }
  }

  // 策略2: 去前缀
  if (alternatives.length < 2) {
    const stripped = query
      .replace(/^(how\s+to|what\s+is|what\s+are|why\s+do|best|top)\s+/i, "")
      .trim();
    if (stripped && stripped !== query && stripped.length > 2) {
      alternatives.push(stripped);
    }
  }

  // 策略3: 提取核心词
  if (alternatives.length < 2) {
    const words = query
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length >= 2) {
      const core = words.slice(0, Math.min(words.length, 3)).join(" ");
      if (core !== query && core.length > 2) {
        alternatives.push(core);
      }
    }
  }

  // 策略4: 技术同义词
  if (alternatives.length < 2) {
    const lower = query.toLowerCase();
    for (const [term, syns] of Object.entries(TECH_SYNONYMS)) {
      if (lower.includes(term)) {
        for (const syn of syns) {
          const expanded = query.replace(new RegExp(term, "i"), syn);
          if (expanded !== query) {
            alternatives.push(expanded);
            break;
          }
        }
        break;
      }
    }
  }

  return [...new Set(alternatives)].slice(0, 2);
}
