import { validateUrl } from "../infrastructure/url-validator.js";
import type { ScoredResult } from "./scorer.js";

export interface EnrichOptions {
  maxEnrich?: number;
  minConfidence?: number;
  minSnippetLength?: number;
  maxLength?: number;
}

export interface EnrichResult {
  enriched: number;
  failures: number;
  results: ScoredResult[];
}

/**
 * 对搜索结果做内容丰富化：
 * 1. 筛选低置信度或短 snippet 的结果
 * 2. 对每条 URL 调用 Jina Reader 提取全文
 * 3. 合并内容到 snippet，提升置信度 +0.33（上限 1.0）
 * 4. 提取失败不中断
 */
export async function enrichResults(
  results: ScoredResult[],
  options?: EnrichOptions
): Promise<EnrichResult> {
  const {
    maxEnrich = 3,
    minConfidence = 0.33,
    minSnippetLength = 80,
    maxLength = 3000,
  } = options ?? {};

  if (results.length === 0) {
    return { enriched: 0, failures: 0, results: [] };
  }

  // 1. 筛选候选：低置信度 或 短 snippet
  const candidates = results.filter(
    (r) => r.confidence < minConfidence || r.snippet.length < minSnippetLength
  );

  if (candidates.length === 0) {
    return { enriched: 0, failures: 0, results };
  }

  // 2. 按 score 排序取 top-N
  const toEnrich = [...candidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEnrich);

  // 3. 并行提取
  const extractResults = await Promise.allSettled(
    toEnrich.map(async (result) => {
      const validation = validateUrl(result.url);
      if (!validation.valid) return null;

      const res = await fetch(`https://r.jina.ai/${result.url}`, {
        headers: { Accept: "text/markdown" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return null;
      return { url: result.url, content: await res.text() };
    })
  );

  let enriched = 0;
  let failures = 0;

  // 4. 建立 url → content 映射
  const urlContentMap = new Map<string, string>();
  for (const result of extractResults) {
    if (result.status === "fulfilled" && result.value) {
      urlContentMap.set(result.value.url, result.value.content);
    } else {
      failures++;
    }
  }

  // 5. 合并到结果集
  const enrichedResults = results.map((r) => {
    const content = urlContentMap.get(r.url);
    if (!content) return r;

    enriched++;
    const truncated = content.slice(0, maxLength);
    return {
      ...r,
      snippet: truncated,
      confidence: Math.min(r.confidence + 0.33, 1.0),
    };
  });

  return {
    enriched,
    failures,
    results: enrichedResults,
  };
}
