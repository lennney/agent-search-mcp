import { describe, it, expect } from 'vitest';
import { decodeHTMLTags } from '../../src/infrastructure/html-utils.js';

describe('decodeHTMLTags', () => {
  it('removes HTML tags', () => {
    expect(decodeHTMLTags('<p>Hello</p>')).toBe('Hello');
  });

  it('decodes HTML entities', () => {
    expect(decodeHTMLTags('&amp; &lt; &gt;')).toBe('& < >');
  });

  it('handles nested tags', () => {
    expect(decodeHTMLTags('<div><span>Hello</span></div>')).toBe('Hello');
  });

  it('trims whitespace', () => {
    expect(decodeHTMLTags('  <p> Hello </p>  ')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(decodeHTMLTags('')).toBe('');
  });

  it('handles text without tags', () => {
    expect(decodeHTMLTags('Hello World')).toBe('Hello World');
  });

  it('decodes quotes', () => {
    expect(decodeHTMLTags('&quot;test&quot;')).toBe('"test"');
  });

  it('decodes single quotes', () => {
    expect(decodeHTMLTags('&#39;test&#39;')).toBe("'test'");
  });
});
