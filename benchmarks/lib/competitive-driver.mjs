import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

const MAX_DRIVER_OUTPUT_CHARACTERS = 5_000_000;
const ALLOWED_FAILURES = new Set([
  'timeout',
  'bot_challenge',
  'rate_limited',
  'permission_denied',
  'upstream_error',
  'unavailable',
  'unknown',
]);

function fail(message) {
  throw new Error(`Invalid competitive driver: ${message}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertPrivateOutputRoot(outputRoot, repositoryRoot) {
  if (!isAbsolute(outputRoot) || !isAbsolute(repositoryRoot)) {
    fail('output and repository roots must be absolute');
  }
  const output = resolve(outputRoot);
  const repository = resolve(repositoryRoot);
  const relation = relative(repository, output);
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    fail('output root must be outside the repository');
  }
  return output;
}

export function validateDriverResponse(call, response) {
  if (!isRecord(response)
    || response.system_version !== call.system_version
    || !Number.isInteger(response.duration_ms)
    || response.duration_ms < 0
    || (response.results === undefined) === (response.failure_type === undefined)
    || (response.failure_type !== undefined && !ALLOWED_FAILURES.has(response.failure_type))) {
    fail(`${call.system_id} returned an invalid or unpinned response`);
  }
  if (response.failure_type !== undefined) {
    return {
      system_version: response.system_version,
      duration_ms: response.duration_ms,
      failure_type: response.failure_type,
    };
  }
  if (!Array.isArray(response.results) || response.results.length > call.result_limit) {
    fail(`${call.system_id} exceeded the result limit`);
  }
  return {
    system_version: response.system_version,
    duration_ms: response.duration_ms,
    results: response.results.map((result, index) => {
      if (!isRecord(result)
        || typeof result.title !== 'string'
        || result.title.length === 0
        || typeof result.url !== 'string'
        || !/^https?:\/\//u.test(result.url)
        || (result.snippet !== undefined && typeof result.snippet !== 'string')) {
        fail(`${call.system_id} result ${index + 1} is invalid`);
      }
      return {
        title: result.title,
        url: result.url,
        ...(result.snippet !== undefined && { snippet: result.snippet }),
      };
    }),
  };
}

export function createSubprocessCompetitiveInvoker(options) {
  const drivers = options?.drivers;
  const spawnImpl = options?.spawnImpl ?? spawn;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  if (!(drivers instanceof Map) || typeof spawnImpl !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    fail('drivers, spawn implementation, and timeout are required');
  }

  return call => new Promise((resolvePromise, reject) => {
    const driver = drivers.get(call.system_id);
    if (typeof driver !== 'string' || driver.length === 0) {
      reject(new Error(`No driver configured for ${call.system_id}`));
      return;
    }
    const isNodeDriver = /\.(?:cjs|mjs|js)$/iu.test(driver);
    const command = isNodeDriver ? process.execPath : driver;
    const args = isNodeDriver ? [driver] : [];
    const child = spawnImpl(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: safeDriverEnvironment(process.env),
    });
    let stdout = '';
    let settled = false;
    const finish = callback => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`Driver timed out for ${call.system_id}`)));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > MAX_DRIVER_OUTPUT_CHARACTERS) {
        child.kill();
        finish(() => reject(new Error(`Driver output exceeded limit for ${call.system_id}`)));
      }
    });
    child.on('error', error => finish(() => reject(error)));
    child.on('close', code => finish(() => {
      if (code !== 0) {
        reject(new Error(`Driver exited non-zero for ${call.system_id}`));
        return;
      }
      let response;
      try {
        response = JSON.parse(stdout);
      } catch {
        reject(new Error(`Driver returned invalid JSON for ${call.system_id}`));
        return;
      }
      try {
        resolvePromise(validateDriverResponse(call, response));
      } catch (error) {
        reject(error);
      }
    }));
    child.stdin.end(JSON.stringify({
      schema_version: 1,
      kind: 'competitive-search-request',
      sample_id: call.sample_id,
      query: call.query,
      language: call.language,
      system_id: call.system_id,
      expected_system_version: call.system_version,
      result_limit: call.result_limit,
      options: call.options,
    }));
  });
}

function safeDriverEnvironment(environment) {
  const allowed = [
    'PATH', 'Path', 'PATHEXT',
    'SYSTEMROOT', 'SystemRoot',
    'TEMP', 'TMP',
  ];
  return Object.fromEntries(
    allowed
      .filter(name => typeof environment[name] === 'string')
      .map(name => [name, environment[name]]),
  );
}
