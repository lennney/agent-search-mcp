/**
 * Semantic reranker — embedding-based result reranking.
 *
 * Supports multiple backends:
 * - Jina Embeddings API (needs JINA_API_KEY env var, free tier available)
 * - OpenAI Embeddings API (needs OPENAI_API_KEY env var)
 * - No-op fallback when no API key is configured
 *
 * The reranker computes embedding vectors for the query and each search result,
 * then reranks by cosine similarity. This catches conceptually related results
 * that don't share keywords with the query.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbeddingProvider = 'jina' | 'openai' | 'none';

export interface SemanticRerankerOptions {
  /** Embedding provider to use */
  provider?: EmbeddingProvider;
  /** Jina API key (default: process.env.JINA_API_KEY) */
  jinaApiKey?: string;
  /** OpenAI API key (default: process.env.OPENAI_API_KEY) */
  openaiApiKey?: string;
  /** Max results to rerank (default: 20, to limit API cost) */
  maxResults?: number;
  /** Embedding model (provider-specific default) */
  model?: string;
}

export interface SemanticRerankerResult<T extends { title: string; snippet: string; url: string }> {
  reranked: T[];
  /** How many results were actually reranked (0 = no embedding available) */
  rerankedCount: number;
  /** Which provider was used */
  provider: EmbeddingProvider;
  /** Model used */
  model: string;
}

// ---------------------------------------------------------------------------
// Cosine Similarity (exported for testing)
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ---------------------------------------------------------------------------
// Jina Embeddings
// ---------------------------------------------------------------------------

async function getJinaEmbedding(
  texts: string[],
  apiKey: string,
  model: string = 'jina-embeddings-v3',
): Promise<number[][]> {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
      normalized: true,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Jina API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// OpenAI Embeddings
// ---------------------------------------------------------------------------

async function getOpenAIEmbedding(
  texts: string[],
  apiKey: string,
  model: string = 'text-embedding-3-small',
): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// Main reranker — works with any result type that has title/snippet/url
// ---------------------------------------------------------------------------

function detectProvider(options: SemanticRerankerOptions): {
  provider: EmbeddingProvider;
  apiKey: string;
  model: string;
} {
  const jinaKey = options.jinaApiKey || process.env.JINA_API_KEY || '';
  const openaiKey = options.openaiApiKey || process.env.OPENAI_API_KEY || '';

  if (options.provider === 'jina' && jinaKey) {
    return { provider: 'jina', apiKey: jinaKey, model: options.model || 'jina-embeddings-v3' };
  }
  if (options.provider === 'openai' && openaiKey) {
    return { provider: 'openai', apiKey: openaiKey, model: options.model || 'text-embedding-3-small' };
  }

  // Auto-detect: prefer Jina (free tier), then OpenAI
  if (jinaKey) {
    return { provider: 'jina', apiKey: jinaKey, model: options.model || 'jina-embeddings-v3' };
  }
  if (openaiKey) {
    return { provider: 'openai', apiKey: openaiKey, model: options.model || 'text-embedding-3-small' };
  }

  return { provider: 'none', apiKey: '', model: '' };
}

/**
 * Rerank search results by semantic similarity to the query.
 *
 * Returns the original results (in original order) when no embedding API is configured.
 * When reranking succeeds, results are sorted by semantic similarity descending.
 * The original fields are preserved; similarityScore is added as a new field.
 */
export async function rerankBySemantics<T extends { title: string; snippet: string; url: string }>(
  query: string,
  results: T[],
  options: SemanticRerankerOptions = {},
): Promise<SemanticRerankerResult<T>> {
  if (results.length === 0) {
    return { reranked: results, rerankedCount: 0, provider: 'none', model: '' };
  }

  const { provider, apiKey, model } = detectProvider(options);

  if (provider === 'none') {
    return {
      reranked: results,
      rerankedCount: 0,
      provider: 'none',
      model: '',
    };
  }

  const maxResults = options.maxResults ?? Math.min(results.length, 20);
  const toRerank = results.slice(0, maxResults);

  try {
    // Build texts: combine title + snippet for each result
    const texts = [
      query,
      ...toRerank.map((r) => `${r.title}\n${r.snippet || ''}`.slice(0, 500)),
    ];

    // Get embeddings
    let embeddings: number[][];
    if (provider === 'jina') {
      embeddings = await getJinaEmbedding(texts, apiKey, model);
    } else if (provider === 'openai') {
      embeddings = await getOpenAIEmbedding(texts, apiKey, model);
    } else {
      return { reranked: results, rerankedCount: 0, provider: 'none', model: '' };
    }

    const [queryEmbedding, ...resultEmbeddings] = embeddings;

    // Compute similarity scores
    const scored = toRerank.map((result, i) => ({
      result,
      similarityScore: cosineSimilarity(queryEmbedding, resultEmbeddings[i]),
    }));

    // Sort by similarity descending
    scored.sort((a, b) => b.similarityScore - a.similarityScore);

    // Merge back: reranked results first (sorted), then untouched results
    const rerankedSet = new Set(scored.map((s) => s.result.url));
    const untouched = results.filter((r) => !rerankedSet.has(r.url));

    const reranked = [
      ...scored.map((s) => ({
        ...s.result,
        similarityScore: s.similarityScore,
      })),
      ...untouched,
    ];

    return { reranked, rerankedCount: scored.length, provider, model };
  } catch (error) {
    // If embedding API fails, return original ranking gracefully
    console.error(`[semantic-reranker] ${provider} embedding failed:`, error);
    return { reranked: results, rerankedCount: 0, provider: 'none', model: '' };
  }
}
