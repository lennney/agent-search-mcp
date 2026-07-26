import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Version check — notifies users when a newer version is available on npm.
 * Non-blocking: check runs in background, doesn't delay CLI startup.
 * Result is cached for 1 hour to avoid hitting the registry on every command.
 */

let cachedVersion: string | null = null;
let lastCheckTime = 0;
const CHECK_INTERVAL_MS = 3600_000; // 1 hour

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://registry.npmjs.org/agent-search-mcp/latest', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    return data.version || null;
  } catch {
    // Network errors, timeouts — silently ignore
    return null;
  }
}

export async function checkForUpdates(): Promise<void> {
  const now = Date.now();

  // Use cache if recent
  if (cachedVersion && (now - lastCheckTime) < CHECK_INTERVAL_MS) {
    if (cachedVersion !== CURRENT_VERSION) {
      printUpdateNotice(cachedVersion);
    }
    return;
  }

  // Background check — don't block
  const latest = await fetchLatestVersion();
  lastCheckTime = now;

  if (latest) {
    cachedVersion = latest;
    if (latest !== CURRENT_VERSION) {
      printUpdateNotice(latest);
    }
  }
}

function printUpdateNotice(latest: string): void {
  console.error(
    `\n📦 agent-search-mcp update available: ${CURRENT_VERSION} → ${latest}`,
  );
  console.error(
    `   Run: npm update -g agent-search-mcp`,
  );
  console.error(
    `   Changelog: https://github.com/lennney/agent-search-mcp/blob/main/CHANGELOG.md\n`,
  );
}

export function readCurrentVersion(moduleUrl: string = import.meta.url): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  try {
    const packageJson = JSON.parse(readFileSync(
      join(moduleDirectory, '..', '..', 'package.json'),
      'utf-8',
    )) as { version?: unknown };
    return typeof packageJson.version === 'string'
      ? packageJson.version
      : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const CURRENT_VERSION = readCurrentVersion();
