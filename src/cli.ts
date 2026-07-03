import { SearchProvider } from './types.js';
import { searchWithFallback } from './tools/free-search.js';
import { createHttpServer } from './infrastructure/http.js';
import { loadConfig } from './infrastructure/config.js';

export interface CliArgs {
  command: 'search' | 'extract' | 'serve' | 'help';
  query?: string;
  url?: string;
  count?: number;
  engines?: SearchProvider[];
  port?: number;
  json?: boolean;
  help?: boolean;
  proxy?: string;
  version?: boolean;
}

const VALID_COMMANDS = ['search', 'extract', 'serve'];
const VALID_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily', 'exa'];

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script path
  const result: CliArgs = { command: 'search' };

  if (args.length === 0 || args.includes('--help')) {
    result.help = true;
    return result;
  }

  if (args.includes('--version')) {
    result.version = true;
    return result;
  }

  let i = 0;

  // First arg is command or query
  const first = args[0];
  if (VALID_COMMANDS.includes(first)) {
    result.command = first as CliArgs['command'];
    i = 1;
  } else {
    // Default to search, first arg is query
    result.command = 'search';
  }

  // Parse remaining args
  for (; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--count' && args[i + 1]) {
      result.count = parseInt(args[++i], 10);
    } else if (arg === '--engines' && args[i + 1]) {
      const engineList = args[++i].split(',');
      result.engines = engineList.filter((e): e is SearchProvider => 
        VALID_ENGINES.includes(e as SearchProvider)
      );
    } else if (arg === '--port' && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--proxy' && args[i + 1]) {
      result.proxy = args[++i];
    } else if (!arg.startsWith('--')) {
      // Positional arg
      if (result.command === 'search' && !result.query) {
        result.query = arg;
      } else if (result.command === 'extract' && !result.url) {
        result.url = arg;
      }
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
free-agent-search-mcp CLI v2.1.0

Usage:
  fasm search <query> [options]    Search the web
  fasm extract <url> [options]     Extract page content
  fasm serve [options]             Start HTTP server
  fasm --help                      Show this help
  fasm --version                   Show version

Search Options:
  --count <n>          Number of results (1-50, default: 10)
  --engines <list>     Comma-separated engines (duckduckgo,sogou,bing,baidu,brave,tavily,exa)
  --json               Output as JSON
  --proxy <url>        HTTP proxy URL (e.g., http://127.0.0.1:7890)

Extract Options:
  --json               Output as JSON
  --proxy <url>        HTTP proxy URL

Serve Options:
  --port <n>           HTTP port (default: 3000)

Examples:
  fasm search "TypeScript MCP server"
  fasm search "query" --count 5 --engines bing,baidu
  fasm extract "https://example.com" --json
  fasm serve --port 8080
  fasm search "query" --proxy http://127.0.0.1:7890
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    console.log('free-agent-search-mcp v2.1.0');
    process.exit(0);
  }

  // Set proxy if provided
  if (args.proxy) {
    process.env.HTTP_PROXY = args.proxy;
    process.env.HTTPS_PROXY = args.proxy;
  }

  if (args.command === 'search') {
    if (!args.query) {
      console.error('Error: search command requires a query');
      process.exit(1);
    }

    const results = await searchWithFallback({
      query: args.query,
      count: args.count || 10,
      engines: args.engines || ['duckduckgo', 'sogou'],
    });

    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`\nSearch: "${results.query}"`);
      console.log(`Engines: ${results.engines.join(', ')}`);
      console.log(`Results: ${results.meta.total}\n`);
      
      for (const r of results.results) {
        console.log(`  ${r.title}`);
        console.log(`  ${r.url}`);
        console.log(`  ${r.snippet}`);
        console.log();
      }
    }
  } else if (args.command === 'extract') {
    if (!args.url) {
      console.error('Error: extract command requires a URL');
      process.exit(1);
    }

    const res = await fetch(`https://r.jina.ai/${args.url}`, {
      headers: { 'Accept': 'text/markdown' },
      signal: AbortSignal.timeout(10000),
    });

    const content = await res.text();

    if (args.json) {
      console.log(JSON.stringify({ url: args.url, content }, null, 2));
    } else {
      console.log(content);
    }
  } else if (args.command === 'serve') {
    const config = loadConfig();
    const port = args.port || config.port;

    const server = createHttpServer({
      port,
      enableCors: config.enableCors,
      corsOrigin: config.corsOrigin,
    });

    await server.listen();
    console.log(`Server running on http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
  }
}

// Run main only when executed directly (not when imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/cli.js') || 
  process.argv[1].endsWith('/cli.ts')
);

if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
