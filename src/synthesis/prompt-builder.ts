export interface SynthesisResult {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
  source: string;
}

export function buildPromptHint(query: string, results: SynthesisResult[]): string {
  if (results.length === 0) {
    return `No search results found for query: "${query}"`;
  }

  const top = results.slice(0, 10);
  
  let hint = `You are analyzing search results for the query: "${query}"\n\n`;
  hint += `Here are the results from multiple search engines (sorted by confidence):\n\n`;
  
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    hint += `[${i + 1}] ${r.title}\n`;
    hint += `    URL: ${r.url}\n`;
    hint += `    Source: ${r.source}, Confidence: ${r.confidence}/3\n`;
    if (r.snippet) {
      hint += `    Snippet: ${r.snippet.slice(0, 300)}\n`;
    }
    hint += '\n';
  }

  hint += 'Note on confidence scores: 1 = single source, 2 = verified by 2+ engines, 3 = verified by 3+ engines.\n';
  hint += 'If any result has a date in its snippet or URL, weigh recency accordingly.\n';
  hint += 'Based on these results, please provide a concise, factual answer with citations using [1], [2], etc. ';
  hint += 'If results are insufficient, contradictory, or lack authoritative sources, note that honestly.';
  
  return hint;
}