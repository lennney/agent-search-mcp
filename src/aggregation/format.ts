import { ScoredResult } from './scorer.js';
import { processResultSecurity, getSecurityNote } from '../infrastructure/security.js';
const TITLE_MAX = 100;
const TITLE_MAX_CN = 150;
const SNIPPET_MAX = 200;
const SNIPPET_MAX_CN = 300;

const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/;

export function isChinese(text: string): boolean {
  return CJK_RE.test(text);
}

interface FormattedResult {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
  security?: {
    injection_detected: boolean;
    url_safe: boolean;
    threats: string[];
    warnings: string[];
  };
}

interface FormattedResponse {
  results: FormattedResult[];
  meta: {
    total: number;
    high_confidence: number;
    engines: string[];
  };
  security_note: string;
  rate_limits?: Record<string, { remaining: number; resetInMs: number }>;
}

/**
 * Format search results with security processing.
 * 
 * Security features:
 * - Snippet injection detection and marking
 * - URL phishing detection
 * - Security metadata per result
 */
export function formatResults(results: ScoredResult[]): FormattedResponse {
  const secured = results.map(r => processResultSecurity(r));

  return {
    results: secured.map(r => ({
      title: isChinese(r.title) ? r.title.slice(0, TITLE_MAX_CN) : r.title.slice(0, TITLE_MAX),
      url: r.url,
      snippet: isChinese(r.snippet) ? r.snippet.slice(0, SNIPPET_MAX_CN) : r.snippet.slice(0, SNIPPET_MAX),
      confidence: r.confidence,
      ...(r.security.injectionDetected || !r.security.urlSafe ? {
        security: {
          injection_detected: r.security.injectionDetected,
          url_safe: r.security.urlSafe,
          threats: r.security.threats,
          warnings: r.security.warnings,
        },
      } : {}),
    })),
    meta: {
      total: results.length,
      high_confidence: results.filter(r => r.confidence >= 2).length,
      engines: [...new Set(results.flatMap(r => r.engines || [r.source]))],
    },
    security_note: getSecurityNote(),
  };
}
