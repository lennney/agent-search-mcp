import { describe, expect, it } from 'vitest';
import { selectRelevantPassage } from '../../src/aggregation/passage-selector.js';

describe('selectRelevantPassage', () => {
  it('selects a later sentence that best matches the query', () => {
    const text = [
      'This introduction describes the project at a high level.',
      'The cache stores formatted search responses for repeated requests.',
      'Cancellation signals stop rate-limit waits and retry backoff immediately.',
    ].join(' ');

    const selected = selectRelevantPassage(text, 'cancellation retry signal', 120);

    expect(selected.text).toContain('Cancellation signals');
    expect(selected.matched_terms).toEqual(expect.arrayContaining(['cancellation', 'retry', 'signal']));
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
