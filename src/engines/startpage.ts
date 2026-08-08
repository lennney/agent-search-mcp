import { SearchResult, type EngineSearchOptions } from '../types.js';
import { decodeHTMLTags } from '../infrastructure/html-utils.js';
import { withTimeout } from '../infrastructure/abort.js';
import { logger } from '../infrastructure/logger.js';
import { EngineAdapterError } from './engine-error.js';
import { providerCatalog } from './provider-catalog.js';
import { profileHeaders, resolveRequestProfile, currentProfileWindowKey } from './request-profiles.js';

export const startpageProvider = providerCatalog.startpage;

const STARTPAGE_CHALLENGE_COOLDOWN_MS = 60 * 60 * 1000;

async function getScValue(options?: EngineSearchOptions): Promise<string> {
  try {
    const res = await fetch('https://www.startpage.com/', {
      signal: withTimeout(options?.signal, 5000),
    });
    if (!res.ok) throw new Error(`Startpage token HTTP ${res.status}`);
    const html = await res.text();
    const match = html.match(/name="sc"\s+value="([^"]+)"/);
    return match ? match[1] : '';
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    return '';
  }
}

export async function searchStartpage(query: string, limit: number = 10, options?: EngineSearchOptions): Promise<SearchResult[]> {
  try {
    const sc = await getScValue(options);
    if (!sc) {
      if (options?.throwOnError) throw new Error('Startpage token unavailable');
      logger.warn('Startpage token unavailable');
      return [];
    }

    const body = new URLSearchParams({
      query,
      sc,
      cat: 'web',
      t: 'device',
      abp: '1',
      abd: '0',
      abe: '0',
      segment: 'organic',
    }).toString();

    const profile = resolveRequestProfile(query, currentProfileWindowKey());
    const res = await fetch('https://www.startpage.com/sp/search', {
      method: 'POST',
      headers: {
        ...profileHeaders(profile, {
          acceptLanguage: 'en-US,en;q=0.9',
          referer: 'https://www.startpage.com/',
          kind: 'form',
        }),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: withTimeout(options?.signal, 15000),
    });

    if (!res.ok) {
      if (options?.throwOnError) throw new Error(`Startpage HTTP ${res.status}`);
      logger.warn({ status: res.status }, 'Startpage HTTP error');
      return [];
    }

    const html = await res.text();
    throwIfStartpageChallenge(html);
    return parseStartpageHTML(html, limit);
  } catch (error) {
    options?.signal?.throwIfAborted();
    if (options?.throwOnError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort') || msg.includes('timeout')) {
      logger.warn('Startpage search timed out');
    } else {
      logger.warn({ err: msg.slice(0, 200) }, 'Startpage search failed');
    }
    return [];
  }
}

/**
 * Startpage serves an anti-bot verification page as HTTP 200 with no result
 * blocks. Surface it as bot_challenge instead of silently parsing an empty
 * result page, mirroring the Mojeek Altcha fix.
 */
function throwIfStartpageChallenge(html: string): void {
  if (/<div[^>]*class="[^"]*result[^"]*"[^>]*>/i.test(html)) return;
  const normalized = html.toLowerCase();
  if (normalized.includes('altcha-widget')
    || normalized.includes('captcha')
    || normalized.includes('unusual traffic')
    || normalized.includes('verification required')) {
    throw new EngineAdapterError(
      'bot_challenge',
      'Startpage returned an anti-bot challenge',
      {
        retryable: false,
        cooldownMs: STARTPAGE_CHALLENGE_COOLDOWN_MS,
        suggestion: 'Wait for the provider cooldown or use another network runner',
      },
    );
  }
}

function parseStartpageHTML(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Find result blocks: <div class="result"> containing <a href=...>
  const blockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    if (!url || url.includes('startpage.com')) continue;

    // Get surrounding context for title and snippet
    const pos = match.index;
    const context = html.slice(Math.max(0, pos - 200), Math.min(html.length, pos + 2000));

    // Title: <h2>...</h2>
    const titleMatch = context.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = titleMatch ? decodeHTMLTags(titleMatch[1]) : '';

    // Snippet: <p>...</p>
    const snippetMatch = context.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? decodeHTMLTags(snippetMatch[1]) : '';

    if (title && url) {
      results.push({
        title,
        url,
        snippet,
        source: 'startpage',
        engines: ['startpage'],
      });
    }
  }

  return results;
}
