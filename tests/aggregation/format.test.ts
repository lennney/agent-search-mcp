import { describe, it, expect } from 'vitest';
import { formatResults, FormatOptions } from '../../src/aggregation/format.js';
import { ScoredResult } from '../../src/aggregation/scorer.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeResult(i: number, confidence: number = 3 - i * 0.3): ScoredResult {
  return {
    title: `Test Result ${i + 1}`,
    url: `https://example.com/page/${i + 1}`,
    snippet: `This is the snippet for test result number ${i + 1}. It contains enough meaningful content to be a realistic search result snippet.`,
    source: 'duckduckgo',
    engines: ['duckduckgo'],
    confidence,
    score: 0.9 - i * 0.05,
  };
}

function makeResults(n: number, confidences?: number[]): ScoredResult[] {
  return Array.from({ length: n }, (_, i) =>
    makeResult(i, confidences?.[i] ?? (3 - i * 0.3))
  );
}

// ─── Progressive Disclosure ────────────────────────────────────────────────

describe('formatResults — progressive disclosure', () => {
  it('compacts results beyond maxFullResults in compact mode', () => {
    const results = makeResults(10);
    const formatted = formatResults(results, {
      style: 'compact',
      maxFullResults: 3,
    });

    expect(formatted.results).toHaveLength(10);

    // First 3 should be full
    for (let i = 0; i < 3; i++) {
      const r = formatted.results[i];
      expect(r.title).toBeDefined();
      expect(r.url).toBeDefined();
      expect(r.snippet).toBeDefined();
      expect(r.confidence).toBeDefined();
      expect(r.compacted).toBeUndefined();
    }

    // Remaining 7 should be compacted
    for (let i = 3; i < 10; i++) {
      const r = formatted.results[i];
      expect(r.title).toBeDefined();
      expect(r.url).toBeDefined();
      expect(r.compacted).toBe(true);
      // compacted items must NOT have snippet or confidence
      expect((r as any).snippet).toBeUndefined();
      expect((r as any).confidence).toBeUndefined();
    }

    expect(formatted.meta as any).toHaveProperty('compacted_count', 7);
  });

  it('does NOT apply progressive disclosure when maxFullResults is not passed (defaults come from config, not format function)', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, { style: 'compact' });

    expect(formatted.results).toHaveLength(5);
    // No maxFullResults passed → no progressive disclosure at format level
    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(0);
  });

  it('respects custom maxFullResults', () => {
    const results = makeResults(10);
    const formatted = formatResults(results, {
      style: 'compact',
      maxFullResults: 5,
    });

    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(5); // 10 - 5 = 5
    expect((formatted.meta as any).compacted_count).toBe(5);
  });

  it('handles maxFullResults larger than result count', () => {
    const results = makeResults(3);
    const formatted = formatResults(results, {
      style: 'compact',
      maxFullResults: 10,
    });

    // All should be full, none compacted
    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(0);
    expect((formatted.meta as any).compacted_count).toBe(0);
  });

  it('does NOT apply progressive disclosure in normal mode', () => {
    const results = makeResults(10);
    const formatted = formatResults(results, {
      style: 'normal',
      maxFullResults: 3,
    });

    // All results should be full (no compacted)
    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(0);
  });

  it('handles maxFullResults=0 (compact all)', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, {
      style: 'compact',
      maxFullResults: 0,
    });

    // All compacted
    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(5);
    expect((formatted.meta as any).compacted_count).toBe(5);
  });

  it('handles empty results gracefully', () => {
    const formatted = formatResults([], {
      style: 'compact',
      maxFullResults: 3,
    });

    expect(formatted.results).toHaveLength(0);
    expect((formatted.meta as any).compacted_count).toBe(0);
  });

  it('compacted items only have title, url, and compacted fields', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, {
      style: 'compact',
      maxFullResults: 2,
    });

    const compacted = formatted.results[2]; // 3rd item (index 3 > maxFull 2, 0-indexed)
    expect(compacted.title).toBeDefined();
    expect(compacted.url).toBeDefined();
    expect(compacted.compacted).toBe(true);

    // Must NOT have these fields
    const keys = Object.keys(compacted as any);
    expect(keys).toContain('title');
    expect(keys).toContain('url');
    expect(keys).toContain('compacted');
    expect(keys).not.toContain('snippet');
    expect(keys).not.toContain('confidence');
    expect(keys).not.toContain('security');
  });
});

// ─── Confidence Filtering ──────────────────────────────────────────────────

describe('formatResults — confidence filtering', () => {
  it('filters results below minConfidence in compact mode', () => {
    const confidences = [3.0, 2.5, 1.8, 1.2, 0.8, 0.5, 0.3];
    const results = makeResults(7, confidences);

    const formatted = formatResults(results, {
      style: 'compact',
      minConfidence: 1.5,
      maxFullResults: 10, // no progressive disclosure to isolate filtering
    });

    // Only results with confidence >= 1.5 should remain: 3.0, 2.5, 1.8 → 3 results
    expect(formatted.results).toHaveLength(3);
    expect(formatted.results[0].confidence).toBeCloseTo(3.0);
    expect(formatted.results[1].confidence).toBeCloseTo(2.5);
    expect(formatted.results[2].confidence).toBeCloseTo(1.8);
    expect((formatted.meta as any).filtered_count).toBe(4);
  });

  it('does not filter when minConfidence is 0', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, {
      style: 'compact',
      minConfidence: 0,
      maxFullResults: 10,
    });

    expect(formatted.results).toHaveLength(5);
    expect((formatted.meta as any).filtered_count).toBe(0);
  });

  it('does not filter in normal mode', () => {
    const results = makeResults(5, [3.0, 2.0, 0.5, 0.3, 0.1]);
    const formatted = formatResults(results, {
      style: 'normal',
      minConfidence: 1.0,
    });

    expect(formatted.results).toHaveLength(5);
  });

  it('applies filtering BEFORE progressive disclosure', () => {
    const confidences = [3.0, 2.8, 2.5, 2.0, 1.5, 1.0, 0.5, 0.3];
    const results = makeResults(8, confidences);

    const formatted = formatResults(results, {
      style: 'compact',
      minConfidence: 1.5,
      maxFullResults: 3,
    });

    // After filter: 3.0, 2.8, 2.5, 2.0, 1.5 → 5 results
    // Then progressive: first 3 full, last 2 compacted
    expect(formatted.results).toHaveLength(5);
    expect((formatted.meta as any).filtered_count).toBe(3); // 0.5, 0.3 removed
    expect((formatted.meta as any).compacted_count).toBe(2); // last 2 compacted

    // First 3 should be full (the survivors)
    for (let i = 0; i < 3; i++) {
      expect(formatted.results[i].compacted).toBeUndefined();
      expect(formatted.results[i].snippet).toBeDefined();
    }
    // Last 2 should be compacted
    for (let i = 3; i < 5; i++) {
      expect(formatted.results[i].compacted).toBe(true);
    }
  });

  it('returns empty when all results are filtered out', () => {
    const results = makeResults(3, [0.5, 0.3, 0.1]);
    const formatted = formatResults(results, {
      style: 'compact',
      minConfidence: 1.0,
    });

    expect(formatted.results).toHaveLength(0);
    expect((formatted.meta as any).filtered_count).toBe(3);
    // compacted_count is undefined because maxFullResults was not passed
    expect(formatted.meta.total).toBe(3);
  });
});

// ─── Backward Compatibility ────────────────────────────────────────────────

describe('formatResults — backward compatibility', () => {
  it('behaves identically to current compact mode when no new options are set', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, { style: 'compact' });

    // All results should be full (backward compat: maxFullResults defaults to Infinity when style is compact)
    expect(formatted.results).toHaveLength(5);
    for (const r of formatted.results) {
      expect(r.snippet).toBeDefined();
      expect(r.confidence).toBeDefined();
    }
    // compacted_count only present when maxFullResults is explicitly passed to formatResults
    // (defaults come from config/env, not the format function itself)
    expect((formatted.meta as any).compacted_count).toBeUndefined();
    expect((formatted.meta as any).filtered_count).toBeUndefined();
  });

  it('normal mode with new options does not affect output', () => {
    const results = makeResults(5);
    const formatted = formatResults(results, {
      style: 'normal',
      maxFullResults: 3,
      minConfidence: 2.0,
    });

    // normal mode ignores progressive disclosure and filtering
    expect(formatted.results).toHaveLength(5);
    const compactedCount = formatted.results.filter((r: any) => r.compacted).length;
    expect(compactedCount).toBe(0);
  });
});
