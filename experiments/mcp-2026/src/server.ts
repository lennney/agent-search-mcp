import {
  McpServer,
  createMcpHandler,
  type McpHttpHandler,
  type McpRequestContext,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const SEARCH_PROVIDERS = [
  'duckduckgo',
  'sogou',
  'bing',
  'baidu',
  'wikipedia',
  'startpage',
  'yandex',
  'mojeek',
  'brave',
  'tavily',
  'exa',
  'youcom',
] as const;

export interface SearchOptions {
  query: string;
  count?: number;
  engines?: Array<(typeof SEARCH_PROVIDERS)[number]>;
  language?: string;
  waterfall?: boolean;
  enrich?: boolean;
}

export interface SearchResponse {
  query: string;
  engines: string[];
  results: Array<{
    title: string;
    url: string;
    snippet?: string;
    confidence?: number;
    relevance?: number;
    source_count?: number;
    sources?: string[];
    evidence?: {
      passage_score: number;
      matched_terms: string[];
      published_at: string | null;
      extraction: 'search_snippet' | 'reader_extracted';
      source_chars: number;
      selected_chars: number;
    };
  }>;
  meta: {
    total: number;
    high_confidence: number;
    engines: string[];
    evidence_budget?: {
      unit: 'characters';
      limit: number;
      used: number;
      truncated_results: number;
    };
  };
  security_note: string;
}

export interface SearchExecutionContext {
  signal?: AbortSignal;
  traceContext?: W3CTraceContext;
}

export interface W3CTraceContext {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export type SearchExecutor = (
  options: SearchOptions,
  context?: SearchExecutionContext,
) => Promise<SearchResponse>;
export type ExperimentalHandler = McpHttpHandler;

export interface ExperimentalServerOptions {
  search?: SearchExecutor;
  legacy?: 'stateless' | 'reject';
  onerror?: (error: Error) => void;
}

let rootSearchExecutor: SearchExecutor | undefined;

/**
 * Load the stable search domain implementation after the root project build.
 *
 * Only JSON-shaped arguments and results cross this boundary. No SDK v1
 * Client, Server, Transport, or error object is passed into the v2 package.
 */
export async function executeStableSearch(
  options: SearchOptions,
  context?: SearchExecutionContext,
): Promise<SearchResponse> {
  if (!rootSearchExecutor) {
    const moduleUrl = new URL('../../../dist/tools/free-search.js', import.meta.url);
    const loaded = await import(moduleUrl.href) as {
      searchWithFallback?: (
        options: SearchOptions & { signal?: AbortSignal },
      ) => Promise<SearchResponse>;
    };
    if (typeof loaded.searchWithFallback !== 'function') {
      throw new Error(
        'Stable search build is missing. Run `npm run build` at the repository root first.',
      );
    }
    rootSearchExecutor = (searchOptions, executionContext) =>
      loaded.searchWithFallback!({
        ...searchOptions,
        signal: executionContext?.signal,
      });
  }
  return rootSearchExecutor(options, context);
}

/**
 * Build one SDK v2 server instance for the protocol era selected by the entry.
 */
export function createExperimentalServer(
  context: McpRequestContext,
  search: SearchExecutor = executeStableSearch,
): McpServer {
  const server = new McpServer(
    {
      name: 'agent-search-mcp-experimental-2026',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        `Experimental Agent Search entry for MCP 2026-07-28. Protocol era: ${context.era}.`,
      cacheHints: {
        'tools/list': {
          ttlMs: 300_000,
          cacheScope: 'public',
        },
      },
    },
  );

  server.registerTool(
    'free_search',
    {
      title: 'Agent Search',
      description:
        'Search the web through the Agent Search multi-engine router. Read-only and idempotent.',
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('Search query'),
        limit: z.number().int().min(1).max(20).default(10),
        engines: z.array(z.enum(SEARCH_PROVIDERS)).optional(),
        language: z.enum(['auto', 'en', 'zh']).default('auto'),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit, engines, language }, toolContext) => {
      try {
        const traceContext = readW3CTraceContext(toolContext.http?.req);
        const response = await search({
          query,
          count: limit,
          engines,
          language,
          waterfall: true,
          enrich: false,
        }, {
          signal: toolContext.mcpReq.signal,
          ...(traceContext !== undefined && { traceContext }),
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(response),
          }],
          structuredContent: response,
        };
      } catch (error) {
        if (toolContext.mcpReq.signal.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text',
            text: `Search failed: ${message}`,
          }],
          isError: true,
        };
      }
    },
  );

  return server;
}

function readW3CTraceContext(request: Request | undefined): W3CTraceContext | undefined {
  if (request === undefined) return undefined;
  const traceparent = request.headers.get('traceparent') ?? undefined;
  const tracestate = request.headers.get('tracestate') ?? undefined;
  const baggage = request.headers.get('baggage') ?? undefined;
  if (traceparent === undefined && tracestate === undefined && baggage === undefined) {
    return undefined;
  }
  return {
    ...(traceparent !== undefined && { traceparent }),
    ...(tracestate !== undefined && { tracestate }),
    ...(baggage !== undefined && { baggage }),
  };
}

/**
 * Create the web-standard HTTP handler that serves both protocol eras.
 */
export function createExperimentalHandler(
  options: ExperimentalServerOptions = {},
): ExperimentalHandler {
  const search = options.search ?? executeStableSearch;
  return createMcpHandler(
    context => createExperimentalServer(context, search),
    {
      legacy: options.legacy ?? 'stateless',
      responseMode: 'auto',
      onerror: options.onerror,
    },
  );
}
