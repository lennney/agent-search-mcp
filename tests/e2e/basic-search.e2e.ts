import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface, Interface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = process.env.E2E_SERVER_PATH
  ? resolve(process.env.E2E_SERVER_PATH)
  : resolve(__dirname, '../../dist/index.js');
const EXPECTED_SERVER_VERSION = process.env.E2E_EXPECTED_SERVER_VERSION || '3.2.0';

// Guard: the E2E test spawns the compiled binary, so dist/ must exist.
// CI runs build before test, but this check gives a clear failure message
// instead of cryptic timeouts when dist/ is missing.
// E2E tests require a pre-built server. If dist/ is missing, skip all tests
// with a clear message rather than a suite-level failure.
const E2E_SKIP = !existsSync(SERVER_PATH);
const LIVE_NETWORK_E2E = process.env.RUN_LIVE_NETWORK_E2E === 'true';
type LiveSearchEngine = 'duckduckgo' | 'bing' | 'baidu' | 'yandex';
const DEFAULT_LIVE_E2E_ENGINES: readonly LiveSearchEngine[] = [
  'duckduckgo',
  'bing',
  'baidu',
  'yandex',
];
const LIVE_E2E_ENGINES = new Set<LiveSearchEngine>(
  (process.env.LIVE_E2E_ENGINES ?? DEFAULT_LIVE_E2E_ENGINES.join(','))
    .split(',')
    .map(engine => engine.trim())
    .filter((engine): engine is LiveSearchEngine =>
      DEFAULT_LIVE_E2E_ENGINES.includes(engine as LiveSearchEngine)),
);
const LIVE_REQUEST_LIMIT = Number.parseInt(
  process.env.LIVE_E2E_MAX_REQUESTS || '5',
  10,
);
const LIVE_E2E_INCLUDE_EXTRACT = process.env.LIVE_E2E_INCLUDE_EXTRACT !== 'false';
const liveNetworkIt = LIVE_NETWORK_E2E && LIVE_E2E_ENGINES.has('duckduckgo') ? it : it.skip;
const liveExtractIt = LIVE_NETWORK_E2E
  && LIVE_E2E_INCLUDE_EXTRACT
  && LIVE_REQUEST_LIMIT >= 2
  ? it
  : it.skip;
const LIVE_MIN_INTERVAL_MS = Number.parseInt(
  process.env.LIVE_E2E_MIN_INTERVAL_MS || '10000',
  10,
);
let liveRequests = 0;
let lastLiveRequestAt = 0;
let liveProbeStopReason: string | undefined;

async function claimLiveRequest(): Promise<void> {
  if (liveRequests >= LIVE_REQUEST_LIMIT) {
    throw new Error(`Live E2E request limit exceeded: ${LIVE_REQUEST_LIMIT}`);
  }
  const waitMs = Math.max(
    LIVE_MIN_INTERVAL_MS - (Date.now() - lastLiveRequestAt),
    0,
  );
  if (lastLiveRequestAt > 0 && waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  liveRequests += 1;
  lastLiveRequestAt = Date.now();
}

beforeAll(() => {
  if (E2E_SKIP) {
    console.warn(
      `[E2E] Server binary missing at ${SERVER_PATH}. ` +
      'Run npm run build before testing. Skipping E2E suite.'
    );
  }
});

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * Creates a message reader that yields complete JSON-RPC messages from a child process stdout.
 * Uses readline for proper line-buffered reading.
 */
function createMessageReader(
  proc: ChildProcess,
  timeoutMs: number = 10000,
): {
  readMessage: () => Promise<JsonRpcMessage>;
  dispose: () => void;
} {
  let pendingResolve: ((msg: JsonRpcMessage) => void) | null = null;
  let pendingReject: ((err: Error) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rl: Interface | null = null;

  function startTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (pendingReject) {
        const err = new Error(`Timeout waiting for message after ${timeoutMs}ms`);
        pendingReject(err);
        pendingResolve = null;
        pendingReject = null;
      }
    }, timeoutMs);
  }

  rl = createInterface({
    input: proc.stdout!,
    crlfDelay: Infinity,
  });

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed) as JsonRpcMessage;
      if (pendingResolve) {
        if (timer) clearTimeout(timer);
        timer = null;
        const resolve = pendingResolve;
        pendingResolve = null;
        pendingReject = null;
        resolve(msg);
      }
    } catch {
      // Ignore non-JSON lines (could be log output leaking to stdout)
    }
  });

  proc.on('exit', (code) => {
    if (pendingReject) {
      if (timer) clearTimeout(timer);
      pendingReject(new Error(`Process exited with code ${code} before receiving message`));
      pendingResolve = null;
      pendingReject = null;
    }
  });

  function readMessage(): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      startTimer();
    });
  }

  function dispose() {
    if (timer) clearTimeout(timer);
    if (pendingReject) {
      pendingReject(new Error('Reader disposed'));
      pendingResolve = null;
      pendingReject = null;
    }
    if (rl) {
      rl.close();
      rl = null;
    }
  }

  return { readMessage, dispose };
}

function sendMessage(proc: ChildProcess, msg: Record<string, unknown>): void {
  proc.stdin!.write(JSON.stringify(msg) + '\n');
}

function spawnServer(): ChildProcess {
  return spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MODE: 'stdio',
      // Prevent real API calls from using paid engines
      BRAVE_API_KEY: '',
      BOCHA_API_KEY: '',
      TAVILY_API_KEY: '',
      TENCENT_WSA_API_KEY: '',
      EXA_API_KEY: '',
      SERPER_API_KEY: '',
      YDC_API_KEY: '',
      SEARCH_PROVIDER_MODE: 'free_only',
      // One adapter attempt per live request: no automatic network retry.
      SEARCH_BUDGET_MAX_CALLS: LIVE_NETWORK_E2E ? '1' : '16',
    },
  });
}

/** Wait for the server process to be ready (brief delay for startup). */
function waitForStartup(ms: number = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(E2E_SKIP ? describe.skip : describe)('E2E: MCP server stdio mode', () => {
  let proc: ChildProcess;
  let reader: ReturnType<typeof createMessageReader>;

  afterEach(() => {
    try {
      if (reader) reader.dispose();
    } catch { /* ignore */ }
    try {
      if (proc && !proc.killed) proc.kill('SIGTERM');
    } catch { /* ignore */ }
  });

  // ─── Helper: perform MCP handshake ───
  async function initialize(p: ChildProcess, r: ReturnType<typeof createMessageReader>) {
    // Send initialize
    sendMessage(p, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0.0' },
      },
    });

    const initResponse = await r.readMessage();
    expect(initResponse).toHaveProperty('result');
    expect(initResponse).toHaveProperty('id', 1);

    // Send initialized notification
    sendMessage(p, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  }

  function skipIfLiveProbesStopped(skip: (reason?: string) => void): boolean {
    if (!liveProbeStopReason) return false;
    skip(`Live probes stopped after ${liveProbeStopReason}`);
    return true;
  }

  function assertLiveEngineResults(
    response: JsonRpcResponse,
    engine: LiveSearchEngine,
  ): void {
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');

    const result = response.result as Record<string, unknown>;
    const structuredContent = result.structuredContent as Record<string, unknown>;
    const failures = Array.isArray(structuredContent.partialFailures)
      ? structuredContent.partialFailures as Array<Record<string, unknown>>
      : [];
    const challenge = failures.find(failure => failure.type === 'bot_challenge');
    if (challenge) {
      liveProbeStopReason = `${engine} returned bot_challenge: ${String(challenge.message ?? 'challenge')}`;
      throw new Error(`[E2E] Stopping live probes: ${liveProbeStopReason}`);
    }

    expect(structuredContent.results).toEqual(expect.any(Array));
    expect((structuredContent.results as unknown[]).length).toBeGreaterThan(0);
  }

  it('responds to initialize with server info', async () => {
    proc = spawnServer();
    reader = createMessageReader(proc, 15000);
    await waitForStartup(500);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '1.0.0' },
      },
    });

    const response = await reader.readMessage();
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 1);
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');

    const result = (response as JsonRpcResponse).result as Record<string, unknown>;
    expect(result).toHaveProperty('serverInfo');
    expect((result.serverInfo as Record<string, unknown>).name).toBe('agent-search-mcp');
    expect((result.serverInfo as Record<string, unknown>).version).toBe(EXPECTED_SERVER_VERSION);
  }, 20000);

  it('lists tools after initialization', async () => {
    proc = spawnServer();
    reader = createMessageReader(proc, 15000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const response = await reader.readMessage();
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 2);
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');

    const result = (response as JsonRpcResponse).result as Record<string, unknown>;
    expect(result).toHaveProperty('tools');
    const tools = result.tools as Array<Record<string, unknown>>;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('free_search');
    expect(toolNames).toContain('free_extract');
    const freeSearch = tools.find((tool) => tool.name === 'free_search');
    expect(freeSearch?.outputSchema).toEqual(expect.objectContaining({
      type: 'object',
      required: expect.arrayContaining(['query', 'engines', 'results', 'meta', 'security_note']),
    }));
  }, 20000);

  liveNetworkIt('calls free_search and returns results', async () => {
    await claimLiveRequest();
    proc = spawnServer();
    // Each bounded live smoke selects one adapter explicitly and permits one
    // adapter attempt. It does not fan out across the free-provider set.
    reader = createMessageReader(proc, 50000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'free_search',
        arguments: {
          query: 'test',
          count: 3,
          engines: ['duckduckgo'],
        },
      },
    });

    const response = await reader.readMessage();
    assertLiveEngineResults(response as JsonRpcResponse, 'duckduckgo');
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 3);
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');

    const result = (response as JsonRpcResponse).result as Record<string, unknown>;
    expect(result).toHaveProperty('structuredContent');
    expect(result.structuredContent).toEqual(expect.objectContaining({
      query: 'test',
      results: expect.any(Array),
      meta: expect.any(Object),
    }));
    const structuredContent = result.structuredContent as Record<string, unknown>;
    expect((structuredContent.results as unknown[]).length).toBeGreaterThan(0);
    // The compact text view keeps clients without structured-output support useful.
    expect(result).toHaveProperty('content');
    const content = result.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);

    // Content should contain search result text
    const textContent = content[0];
    expect(textContent).toHaveProperty('type', 'text');
    expect(textContent).toHaveProperty('text');
    expect(typeof (textContent as Record<string, unknown>).text).toBe('string');
    expect((textContent as Record<string, unknown>).text).toBeTruthy();
  }, 60000);

  it.runIf(LIVE_NETWORK_E2E && LIVE_E2E_ENGINES.has('bing'))('calls free_search through Bing and returns results', async ({ skip }) => {
    if (skipIfLiveProbesStopped(skip)) return;
    await claimLiveRequest();
    proc = spawnServer();
    reader = createMessageReader(proc, 50000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'free_search',
        arguments: {
          query: 'OpenAI',
          count: 3,
          engines: ['bing'],
        },
      },
    });

    assertLiveEngineResults(await reader.readMessage() as JsonRpcResponse, 'bing');
  }, 60000);

  it.runIf(LIVE_NETWORK_E2E && LIVE_E2E_ENGINES.has('baidu'))('calls free_search through Baidu and returns results', async ({ skip }) => {
    if (skipIfLiveProbesStopped(skip)) return;
    await claimLiveRequest();
    proc = spawnServer();
    reader = createMessageReader(proc, 50000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'free_search',
        arguments: {
          query: '人工智能',
          count: 3,
          engines: ['baidu'],
        },
      },
    });

    assertLiveEngineResults(await reader.readMessage() as JsonRpcResponse, 'baidu');
  }, 60000);

  it.runIf(LIVE_NETWORK_E2E && LIVE_E2E_ENGINES.has('yandex'))('calls free_search through Yandex and returns results', async ({ skip }) => {
    if (skipIfLiveProbesStopped(skip)) return;
    await claimLiveRequest();
    proc = spawnServer();
    reader = createMessageReader(proc, 50000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'free_search',
        arguments: {
          query: 'OpenAI',
          count: 3,
          engines: ['yandex'],
        },
      },
    });

    assertLiveEngineResults(await reader.readMessage() as JsonRpcResponse, 'yandex');
  }, 60000);

  liveExtractIt('calls free_extract and returns content', async ({ skip }) => {
    if (skipIfLiveProbesStopped(skip)) return;
    await claimLiveRequest();
    proc = spawnServer();
    reader = createMessageReader(proc, 20000);
    await waitForStartup(500);

    await initialize(proc, reader);

    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'free_extract',
        arguments: {
          url: 'https://example.com',
          max_length: 500,
        },
      },
    });

    const response = await reader.readMessage();
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 4);
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');

    const result = (response as JsonRpcResponse).result as Record<string, unknown>;
    expect(result).toHaveProperty('content');
    const content = result.content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);

    const textContent = content[0];
    expect(textContent).toHaveProperty('type', 'text');
    expect(textContent).toHaveProperty('text');
    expect(typeof (textContent as Record<string, unknown>).text).toBe('string');
  }, 30000);
});
