#!/usr/bin/env node
import { readFileSync, realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
  SEARCH_PROVIDERS,
  type SearchProvider,
} from './types.js';
import { searchWithFallback } from './tools/free-search.js';
import { createHttpServer } from './infrastructure/http.js';
import { loadConfig } from './infrastructure/config.js';
import {
  createDoctorReport,
  formatDoctorReport,
} from './infrastructure/doctor.js';
import { checkForUpdates } from './infrastructure/version-check.js';

// Read package.json version at module load
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

export interface CliArgs {
  command: 'search' | 'extract' | 'serve' | 'doctor' | 'help';
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

const VALID_COMMANDS = ['search', 'extract', 'serve', 'doctor'];
const VALID_ENGINES: readonly SearchProvider[] = SEARCH_PROVIDERS;

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
agent-search-mcp CLI v${PKG_VERSION}

Usage:
  fasm search <query> [options]    Search the web
  fasm extract <url> [options]     Extract page content
  fasm serve [options]             Start HTTP server
  fasm doctor [--json]             Inspect local search readiness
  fasm --help                      Show this help
  fasm --version                   Show version
  fasm update                      Check for updates

Search Options:
  --count <n>          Number of results (1-50, default: 10)
  --engines <list>     Comma-separated engines (all ${SEARCH_PROVIDERS.length} adapters supported)
  --json               Output as JSON
  --proxy <url>        HTTP proxy URL (e.g., http://127.0.0.1:7890)

Extract Options:
  --json               Output as JSON

Serve Options:
  --port <n>           HTTP port (default: 3000)

Examples:
  fasm search "TypeScript MCP server"
  fasm search "query" --count 5 --engines bing,baidu,youcom
  fasm extract "https://example.com" --json
  fasm serve --port 8080
  fasm doctor --json
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
    console.log(`agent-search-mcp v${PKG_VERSION}`);
    process.exit(0);
  }

  // Doctor is a local-only diagnostic and must not make an update-check request.
  if (args.command !== 'doctor') {
    void checkForUpdates();
  }

  // Search proxy is intentionally scoped to the core engine transport.
  if (args.command === 'search' && args.proxy) {
    process.env.USE_PROXY = 'true';
    process.env.PROXY_URL = args.proxy;
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

    const server = createHttpServer(null, {
      port,
      enableCors: config.enableCors,
      corsOrigin: config.corsOrigin,
      allowedOrigins: config.allowedOrigins,
      authToken: config.httpAuthToken,
    });

    await server.listen();
    console.log(`Server running on http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
  } else if (args.command === 'doctor') {
    const report = createDoctorReport();
    // CLI stdout is the documented user-facing channel, not MCP stdio.
    console.log(args.json
      ? JSON.stringify(report, null, 2)
      : formatDoctorReport(report));
    if (report.status !== 'present') process.exitCode = 1;
  }
}

export function isMainModulePath(
  entryPath: string | undefined,
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entryPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return realpathSync(entryPath) === realpathSync(modulePath);
  } catch {
    return resolve(entryPath) === resolve(modulePath);
  }
}

if (isMainModulePath(process.argv[1])) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
