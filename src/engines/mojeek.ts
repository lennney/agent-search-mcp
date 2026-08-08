import { SearchResult, type EngineSearchOptions } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';
import { withTimeout } from '../infrastructure/abort.js';
import { fetchForEngine } from '../infrastructure/engine-http.js';
import { logger } from '../infrastructure/logger.js';
import { EngineAdapterError } from './engine-error.js';
import { providerCatalog } from './provider-catalog.js';
import { profileHeaders, resolveRequestProfile } from './request-profiles.js';

export const mojeekProvider = providerCatalog.mojeek;

const MOJEEK_CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;
// Mojeek's "automated queries" refusal is a 403 and rate limits a 429; rotating
// exits on these lets a clean exit avoid the Altcha wall. Altcha itself arrives
// as HTTP 200, so it is handled by throwIfMojeekChallenge, not status rotation.
const MOJEEK_ROTATE_STATUS = Object.freeze([403, 429] as const);
const MAX_STATUS_ROTATIONS = 1;

export async function searchMojeek(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const profile = resolveRequestProfile(query);
    const res = await fetchForEngine('mojeek', url, {
      headers: profileHeaders(profile, {
        acceptLanguage: 'en-US,en;q=0.9',
        referer: 'https://www.mojeek.com/',
        kind: 'navigation',
      }),
      signal: withTimeout(options?.signal, 10000),
    }, {
      affinityKey: query,
      rotateOnStatus: MOJEEK_ROTATE_STATUS,
      maxStatusRotations: MAX_STATUS_ROTATIONS,
    });

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`Mojeek HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'Mojeek HTTP error');
      return [];
    }

    const html = await res.text();
    throwIfMojeekChallenge(html);
    return parseMojeekHTML(html, limit);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      logger.warn('Mojeek search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'Mojeek search failed');
    }
    return [];
  }
}

/**
 * Mojeek serves an Altcha proof-of-work captcha (HTTP 200, no 4xx) to requests
 * it suspects. Surface it as bot_challenge instead of silently parsing an empty
 * result page, per the shared no-silent-zero-result contract.
 */
function throwIfMojeekChallenge(html: string): void {
  const normalized = html.toLowerCase();
  if (normalized.includes('altcha-widget')
    || normalized.includes('/captcha/challenge')
    || normalized.includes('captcha-note')
    || normalized.includes('verification required')) {
    throw new EngineAdapterError(
      'bot_challenge',
      'Mojeek returned an anti-bot challenge',
      {
        retryable: false,
        cooldownMs: MOJEEK_CHALLENGE_COOLDOWN_MS,
        suggestion: 'Wait for the provider cooldown or use another network runner',
      },
    );
  }
}

function parseMojeekHTML(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  const blockRegex = /<li[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    const title = decodeHTMLTags(match[2]);
    if (!url || !title) continue;

    const pos = match.index;
    const context = html.slice(pos, Math.min(html.length, pos + 1000));
    const snippetMatch = context.match(/<p[^>]*class="[^"]*s[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? decodeHTMLTags(snippetMatch[1]) : '';

    results.push({
      title,
      url,
      snippet,
      source: 'mojeek',
      engines: ['mojeek'],
    });
  }

  return results;
}
