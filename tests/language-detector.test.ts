import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/aggregation/language-detector.js';

describe('detectLanguage', () => {
  it('detects Chinese text', () => {
    expect(detectLanguage('你好世界这是一个测试')).toBe('zh');
    expect(detectLanguage('Python爬虫教程从入门到精通')).toBe('zh');
  });

  it('detects English text', () => {
    expect(detectLanguage('Hello world this is a test')).toBe('en');
    expect(detectLanguage('TypeScript MCP server tutorial')).toBe('en');
  });

  it('detects Japanese text (hiragana)', () => {
    expect(detectLanguage('こんにちは世界')).toBe('ja');
  });

  it('detects Japanese text (katakana)', () => {
    expect(detectLanguage('コンピュータサイエンス')).toBe('ja');
  });

  it('detects Korean text', () => {
    expect(detectLanguage('안녕하세요세계')).toBe('ko');
  });

  it('returns auto for numbers-only or ambiguous text', () => {
    expect(detectLanguage('1234567890')).toBe('auto');
    expect(detectLanguage('hello 你好')).toBe('zh'); // CJK > 15% threshold
  });

  it('returns auto for empty string', () => {
    expect(detectLanguage('')).toBe('auto');
    expect(detectLanguage('   ')).toBe('auto');
  });
});