#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const serverPath = process.argv[2];
if (!serverPath) {
  console.error('Usage: node scripts/packed-stdio-smoke.mjs <dist/index.js>');
  process.exit(2);
}

const child = spawn(process.execPath, [resolve(serverPath)], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MODE: 'stdio',
    LOG_LEVEL: 'error',
    BRAVE_API_KEY: '',
    TAVILY_API_KEY: '',
    EXA_API_KEY: '',
    YDC_API_KEY: '',
    SEARCH_PROVIDER_MODE: 'free_only',
  },
});

let buffer = '';
let nextId = 1;
const pending = new Map();
const timeout = setTimeout(
  () => fail(new Error('Packed stdio smoke timed out')),
  15_000,
);

child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail(new Error(`Non-JSON stdout from MCP server: ${line.slice(0, 120)}`));
      return;
    }
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler(message);
    }
  }
});

child.once('error', fail);
child.once('exit', code => {
  if (pending.size > 0) {
    fail(new Error(`MCP server exited early with code ${code}`));
  }
});

try {
  const initialized = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'packed-stdio-smoke', version: '1.0.0' },
  });
  if (!initialized.result?.serverInfo?.name) {
    throw new Error('initialize response is missing serverInfo');
  }
  notify('notifications/initialized');

  const listed = await call('tools/list');
  const toolNames = listed.result?.tools?.map(tool => tool.name) ?? [];
  if (!toolNames.includes('free_search') || !toolNames.includes('free_extract')) {
    throw new Error('tools/list is missing required public tools');
  }

  clearTimeout(timeout);
  child.kill();
  console.log(JSON.stringify({
    node: process.version,
    server: initialized.result.serverInfo,
    tools: toolNames.length,
  }));
} catch (error) {
  fail(error);
}

function call(method, params = {}) {
  const id = nextId++;
  return new Promise((resolvePromise, reject) => {
    const callTimeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP call timed out: ${method}`));
    }, 10_000);
    pending.set(id, message => {
      clearTimeout(callTimeout);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolvePromise(message);
      }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function fail(error) {
  clearTimeout(timeout);
  if (!child.killed) child.kill();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
