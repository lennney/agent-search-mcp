import { describe, expect, it } from 'vitest';
import {
  selectRelevantPassage,
  termMatches,
} from '../../src/aggregation/passage-selector.js';

describe('termMatches', () => {
  it('matches Latin terms at word boundaries only', () => {
    expect(termMatches('the catalog has cats', 'cat')).toBe(false);
    expect(termMatches('a cat sits on the mat', 'cat')).toBe(true);
    expect(termMatches('catapult and cat', 'cat')).toBe(true);
  });

  it('rejects inflected forms without a word boundary', () => {
    expect(termMatches('cancellation signals stop', 'signal')).toBe(false);
    expect(termMatches('the signal is clear', 'signal')).toBe(true);
  });

  it('keeps CJK bigram matching contiguous', () => {
    expect(termMatches('编程语言', '编程')).toBe(true);
    expect(termMatches('程序设计', '编程')).toBe(false);
  });
});

describe('selectRelevantPassage', () => {
  it('selects a later sentence that best matches the query', () => {
    const text = [
      'This introduction describes the project at a high level.',
      'The cache stores formatted search responses for repeated requests.',
      'Cancellation signals stop rate-limit waits and retry backoff immediately.',
    ].join(' ');

    const selected = selectRelevantPassage(text, 'cancellation retry signal', 120);

    expect(selected.text).toContain('Cancellation signals');
    // "signal" correctly does not match the plural "signals" at word boundary.
    expect(selected.matched_terms).toEqual(expect.arrayContaining(['cancellation', 'retry']));
    expect(selected.score).toBeGreaterThan(0);
  });

  it('matches Chinese query terms without translating the query', () => {
    const text = '这是项目简介。缓存用于重复搜索。取消信号会立即停止重试和等待。';

    const selected = selectRelevantPassage(text, '取消重试', 80);

    expect(selected.text).toContain('取消信号');
    expect(selected.matched_terms.length).toBeGreaterThan(0);
  });

  it('falls back to a readable bounded prefix when nothing matches', () => {
    const selected = selectRelevantPassage(
      'First sentence explains one topic. Second sentence explains another topic.',
      'unrelated query',
      35,
    );

    expect(selected.text.length).toBeLessThanOrEqual(35);
    expect(selected.score).toBe(0);
  });
});
