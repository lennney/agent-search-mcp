import { SearchProvider, SearchProviderInfo, SearchResult } from '../types.js';

export const exaProvider: SearchProviderInfo = {
  id: 'exa',
  name: 'Exa Search',
  isFree: false,
  languages: ['en', 'zh'],
};

interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
  requestId?: string;
  costDollars?: {
    total: number;
    search?: {
      neural: number;
    };
  };
}

export async function searchExa(options: {
  query: string;
  count?: number;
  apiKey?: string;
}): Promise<SearchResult[]> {
  const { query, count = 10, apiKey } = options;

  if (!apiKey) {
    console.warn('Exa: No API key provided');
    return [];
  }

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: count,
        contents: {
          highlights: true,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Exa: HTTP ${response.status}`);
      return [];
    }

    const data: ExaSearchResponse = await response.json();

    return data.results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.highlights?.[0] || result.text?.substring(0, 200) || '',
      source: `Exa${result.author ? ` (${result.author})` : ''}`,
      engines: ['exa'] as SearchProvider[],
    }));
  } catch (error) {
    console.error('Exa search failed:', error);
    return [];
  }
}
