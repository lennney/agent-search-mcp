import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../infrastructure/logger.js';
import type { ScoredResult } from './scorer.js';

// ── Paths ───────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = resolve(__dirname, 'semantic_bridge.py');

// ── Types ───────────────────────────────────────────────────────────────────

export interface SemanticOptions {
  dedup: boolean;
  dedupThreshold: number;
  rerank: boolean;
  rerankTopK: number;
  model: string;
}

// ── Bridge process singleton ────────────────────────────────────────────────

let _process: ChildProcess | null = null;
let _pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
let _requestId = 0;
let _availability: boolean | null = null; // null = unchecked
let _spawnLock = false; // prevents concurrent spawn attempts

const LOAD_TIMEOUT = 30_000; // 30s for first-load model download
const CMD_TIMEOUT = 5_000;  // 5s for subsequent commands

/**
 * Spawn the Python bridge process (lazy init, singleton).
 */
function spawnBridge(): void {
  if (_process) return;

  logger.info({ script: SCRIPT_PATH }, 'Semantic bridge: spawning Python process');

  const child = spawn('python3', [SCRIPT_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.on('exit', (code, signal) => {
    logger.warn({ code, signal }, 'Semantic bridge process exited');
    // Guard: only run cleanup if this is still the current child (not a respawn).
    // When ensureBridge() spawns a replacement, the old child's queued exit
    // event must not corrupt the new bridge's state (availability, pending requests).
    if (_process === child) {
      _process = null;
      _availability = null;

      // Reject all pending requests
      for (const [, p] of _pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Bridge process exited (code=${code}, signal=${signal})`));
      }
      _pending.clear();
    }
  });

  child.on('error', (err) => {
    logger.error({ err: err.message }, 'Semantic bridge spawn error');
  });

  // Set up line-based reader on stdout
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line: string) => {
      let response: any;
      try {
        response = JSON.parse(line.trim());
      } catch {
        // Ignore non-JSON lines (e.g. model loading progress bars)
        return;
      }

      const pending = _pending.get(response.id);
      if (pending) {
        clearTimeout(pending.timer);
        _pending.delete(response.id);
        pending.resolve(response);
      }
    });
  }

  // Capture stderr for diagnostics
  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        logger.debug({ stderr: msg.slice(0, 200) }, 'Semantic bridge stderr');
      }
    });
  }

  _process = child;
}

/**
 * Ensure the bridge process is running and ready.
 */
function ensureBridge(): void {
  if (!_process || _process.killed || _process.exitCode !== null) {
    // Clean up old state
    if (_process) {
      // Kill the old process before removing listeners to prevent zombies
      try {
        _process.kill();
      } catch {
        // ignore kill errors on already-dead process
      }
      _process.removeAllListeners();
      _process = null;
    }
    _availability = null; // force re-probe on next availability check
    // Reject all pending promises before clearing (same pattern as closeBridge)
    for (const [, p] of _pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Bridge process restarted'));
    }
    _pending.clear();
    // Guard against concurrent spawn — only one caller spawns
    if (!_spawnLock) {
      _spawnLock = true;
      try {
        spawnBridge();
      } finally {
        _spawnLock = false;
      }
    }
  }

  if (!_process?.stdin?.writable) {
    throw new Error('Failed to spawn bridge process');
  }
}

/**
 * Send a JSON-line command to the bridge and wait for the response.
 * Python protocol: {action, ...other fields} → {id?, ...result}
 */
function sendCommand(payload: Record<string, unknown>, timeout: number = CMD_TIMEOUT): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = _process;
    if (!proc?.stdin?.writable) {
      reject(new Error('Bridge process not available'));
      return;
    }

    const id = ++_requestId;
    const request = JSON.stringify({ id, ...payload }) + '\n';

    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`Bridge command "${payload.action}" timed out after ${timeout}ms`));
    }, timeout);

    _pending.set(id, { resolve, reject, timer });

    try {
      proc.stdin.write(request);
    } catch (err) {
      clearTimeout(timer);
      _pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if the semantic bridge (Python / model2vec) is available.
 * Probes on first call, caches result for the process lifetime.
 */
export async function isSemanticAvailable(): Promise<boolean> {
  if (_availability !== null) return _availability;

  try {
    ensureBridge();
    const resp = await sendCommand({ action: 'ping' }, LOAD_TIMEOUT);
    _availability = resp.ok === true;
    if (_availability) {
      logger.info('Semantic bridge is available');
    }
    return _availability;
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'Semantic bridge not available');
    _availability = false;
    return false;
  }
}

/**
 * Remove semantically duplicate results, keeping higher confidence ones.
 * Returns the input unchanged if bridge is unavailable.
 */
export async function semanticDedup(
  results: ScoredResult[],
  threshold: number,
  model?: string
): Promise<{ results: ScoredResult[]; removedCount: number }> {
  if (results.length <= 1) {
    return { results, removedCount: 0 };
  }

  try {
    const available = await isSemanticAvailable();
    if (!available) return { results, removedCount: 0 };

    // Extract text representation for embedding
    const texts = results.map(r => `${r.title}. ${r.snippet}`);
    const confidences = results.map(r => r.confidence);

    const resp = await sendCommand({
      action: 'dedup',
      texts,
      confidences,
      threshold,
      model: model || 'minishlab/M2V_base_output',
    });

    if (resp.error) {
      logger.warn({ err: resp.error }, 'Semantic dedup bridge error');
      return { results, removedCount: 0 };
    }

    const keepIndices: number[] = resp.keep_indices || [];
    const removedCount: number = resp.removed_count || 0;

    if (keepIndices.length === results.length) {
      return { results, removedCount: 0 };
    }

    const kept = keepIndices.map(i => results[i]);
    return { results: kept, removedCount };
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'Semantic dedup failed, returning identity');
    return { results, removedCount: 0 };
  }
}

/**
 * Reorder results by semantic similarity to the query.
 * Returns the input unchanged if bridge is unavailable.
 */
export async function semanticRerank(
  query: string,
  results: ScoredResult[],
  topK: number,
  model?: string
): Promise<ScoredResult[]> {
  if (results.length <= 1) {
    return results;
  }

  try {
    const available = await isSemanticAvailable();
    if (!available) return results;

    // Extract text representation for embedding
    const texts = results.map(r => `${r.title}. ${r.snippet}`);

    const resp = await sendCommand({
      action: 'rerank',
      query,
      texts,
      top_k: topK,
      model: model || 'minishlab/M2V_base_output',
    });

    if (resp.error) {
      logger.warn({ err: resp.error }, 'Semantic rerank bridge error');
      return results;
    }

    const order: number[] = resp.order || [];
    if (order.length === 0) return results;

    // Reorder results by the returned indices
    const reranked = order.map(i => results[i]);
    return reranked;
  } catch (err) {
    logger.warn({ err: String(err).slice(0, 120) }, 'Semantic rerank failed, returning identity');
    return results;
  }
}

// ── Cleanup (for graceful shutdown) ────────────────────────────────────────

/**
 * Shut down the bridge process gracefully.
 */
export function closeBridge(): void {
  if (_process && _process.stdin && _process.stdin.writable) {
    try {
      _process.stdin.end();
    } catch {
      // ignore
    }
  }
  if (_process) {
    _process.kill();
    _process = null;
  }
  _availability = null;

  for (const [, p] of _pending) {
    clearTimeout(p.timer);
    p.reject(new Error('Bridge closed'));
  }
  _pending.clear();
}
