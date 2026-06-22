import { ScoredResult } from './scorer.js';

export function formatResults(results: ScoredResult[]) {
  return {
    results: results.map(r => ({
      title: r.title.slice(0, 100),
      url: r.url,
      snippet: r.snippet.slice(0, 200),
      confidence: r.confidence,
    })),
    meta: {
      total: results.length,
      high_confidence: results.filter(r => r.confidence >= 2).length,
      engines: [...new Set(results.flatMap(r => r.engines || [r.source]))],
    },
  };
}
