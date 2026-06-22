import { SearchProvider } from './types.js';

export interface CliArgs {
  command: 'search' | 'extract' | 'serve' | 'help';
  query?: string;
  url?: string;
  count?: number;
  engines?: SearchProvider[];
  port?: number;
  json?: boolean;
  help?: boolean;
}

const VALID_COMMANDS = ['search', 'extract', 'serve'];
const VALID_ENGINES: SearchProvider[] = ['duckduckgo', 'sogou', 'bing', 'baidu', 'brave', 'tavily'];

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script path
  const result: CliArgs = { command: 'search' };

  if (args.length === 0 || args.includes('--help')) {
    result.help = true;
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
free-agent-search-mcp CLI v2.0.0

Usage:
  fasm search <query> [options]    Search the web
  fasm extract <url> [options]     Extract page content
  fasm serve [options]             Start HTTP server
  fasm --help                      Show this help

Search Options:
  --count <n>          Number of results (1-50, default: 10)
  --engines <list>     Comma-separated engines (duckduckgo,sogou,bing,baidu,brave,tavily)
  --json               Output as JSON

Extract Options:
  --json               Output as JSON

Serve Options:
  --port <n>           HTTP port (default: 3000)

Examples:
  fasm search "TypeScript MCP server"
  fasm search "query" --count 5 --engines bing,baidu
  fasm extract "https://example.com" --json
  fasm serve --port 8080
`);
}
