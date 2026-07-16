import { describe, it, expect } from 'vitest';
import {
  hasChinese,
  toTraditional,
  toSimplified,
  generateChineseVariants,
} from '../src/aggregation/chinese-optimizer.js';

describe('hasChinese', () => {
  it('detects simplified Chinese characters', () => {
    expect(hasChinese('你好世界')).toBe(true);
  });

  it('detects traditional Chinese characters', () => {
    expect(hasChinese('繁體中文')).toBe(true);
  });

  it('detects mixed CJK and ASCII', () => {
    expect(hasChinese('Hello 世界 test')).toBe(true);
  });

  it('returns false for English/ASCII only', () => {
    expect(hasChinese('Hello World')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasChinese('')).toBe(false);
  });

  it('returns false for numbers and punctuation only', () => {
    expect(hasChinese('12345 !@#$%')).toBe(false);
  });

  it('returns false for Japanese kana only (not CJK unified)', () => {
    expect(hasChinese('こんにちは')).toBe(false);
  });
});

describe('toTraditional', () => {
  it('converts simplified characters to traditional', () => {
    expect(toTraditional('这个网站')).toBe('這個網站');
  });

  it('passes through already-traditional characters', () => {
    const traditional = '這個網站';
    expect(toTraditional(traditional)).toBe(traditional);
  });

  it('passes through non-Chinese text unchanged', () => {
    expect(toTraditional('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(toTraditional('')).toBe('');
  });

  it('converts commonly searched terms', () => {
    expect(toTraditional('学习')).toBe('學習');
    expect(toTraditional('国家')).toBe('國家');
    expect(toTraditional('电话')).toBe('電話');
  });
});

describe('toSimplified', () => {
  it('converts traditional characters to simplified', () => {
    expect(toSimplified('這個網站')).toBe('这个网站');
  });

  it('passes through already-simplified characters', () => {
    const simplified = '这个网站';
    expect(toSimplified(simplified)).toBe(simplified);
  });

  it('passes through non-Chinese text unchanged', () => {
    expect(toSimplified('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(toSimplified('')).toBe('');
  });

  it('converts commonly searched terms', () => {
    expect(toSimplified('學習')).toBe('学习');
    expect(toSimplified('國家')).toBe('国家');
    expect(toSimplified('電話')).toBe('电话');
  });
});

describe('generateChineseVariants', () => {
  it('returns empty array for non-Chinese query', () => {
    expect(generateChineseVariants('Hello World')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(generateChineseVariants('')).toEqual([]);
  });

  it('produces traditional variant for simplified query', () => {
    const variants = generateChineseVariants('这个网站很好');
    // Should contain traditional conversion
    expect(variants.some(v => v.includes('這個'))).toBe(true);
  });

  it('produces simplified variant for traditional query', () => {
    const variants = generateChineseVariants('這個網站很好');
    // Should contain simplified conversion
    expect(variants.some(v => v.includes('这个'))).toBe(true);
  });

  it('removes stop words', () => {
    const variants = generateChineseVariants('我的人都在这个网站');
    // Should produce at least one variant without stop words
    const hasRemovedStop = variants.some(v =>
      v.length < '我的人都在这个网站'.length
    );
    expect(hasRemovedStop).toBe(true);
  });

  it('compacts punctuation from query', () => {
    const variants = generateChineseVariants('你好，世界！');
    // Should produce a compacted version without punctuation
    const hasCompacted = variants.some(
      v => !v.includes('，') && !v.includes('！') && v.length < '你好，世界！'.length
    );
    expect(hasCompacted).toBe(true);
  });

  it('compacts spaces from query', () => {
    const variants = generateChineseVariants('学习 机器');
    const hasCompacted = variants.some(v => !v.includes(' '));
    expect(hasCompacted).toBe(true);
  });

  it('deduplicates variants', () => {
    // Query with repeated stop words that would otherwise produce dups
    const variants = generateChineseVariants('的的学习的');
    const unique = [...new Set(variants)];
    expect(variants).toEqual(unique);
  });

  it('does not produce variants shorter than 2 characters', () => {
    const variants = generateChineseVariants('我了');
    // All variants should be at least 2 chars or not present
    for (const v of variants) {
      expect(v.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns variants for mixed CJK and Latin script', () => {
    const variants = generateChineseVariants('AI 学习');
    expect(variants.length).toBeGreaterThanOrEqual(0);
    // Should at minimum compact the space
    const hasCompacted = variants.some(v => !v.includes(' '));
    expect(hasCompacted).toBe(true);
  });
});