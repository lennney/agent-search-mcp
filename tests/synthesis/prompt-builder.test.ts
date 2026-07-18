import { describe, it, expect } from 'vitest';
import { buildPromptHint } from '../../src/synthesis/prompt-builder.js';
import type { SynthesisResult } from '../../src/synthesis/prompt-builder.js';

const makeResult = (
  title: string,
  url: string,
  snippet: string,
  confidence: number,
  source: string = 'duckduckgo',
): SynthesisResult => ({ title, url, snippet, confidence, source });

describe('buildPromptHint', () => {
  it('includes query in output', () => {
    const hint = buildPromptHint('test query', []);
    expect(hint).toContain('test query');
  });

  it('formats results with [N] numbering', () => {
    const results = [
      makeResult('Result 1', 'https://a.com', 'Snippet 1', 3),
      makeResult('Result 2', 'https://b.com', 'Snippet 2', 2),
    ];

    const hint = buildPromptHint('test', results);

    expect(hint).toContain('[1] Result 1');
    expect(hint).toContain('[2] Result 2');
  });

  it('includes URL, source, confidence for each result', () => {
    const results = [
      makeResult('Test', 'https://example.com', 'A snippet', 3, 'duckduckgo'),
    ];

    const hint = buildPromptHint('test', results);

    expect(hint).toContain('URL: https://example.com');
    expect(hint).toContain('Source: duckduckgo');
    expect(hint).toContain('Confidence: 3/3');
  });

  it('limits to 10 results', () => {
    const results = Array.from({ length: 15 }, (_, i) =>
      makeResult(`Result ${i}`, `https://${i}.com`, `Snippet ${i}`, 3),
    );

    const hint = buildPromptHint('test', results);

    expect(hint).toContain('[10]');
    expect(hint).not.toContain('[11]');
  });

  it('handles empty results', () => {
    const hint = buildPromptHint('test', []);

    expect(hint).toContain('No search results found');
    expect(hint).toContain('test');
    expect(hint).not.toContain('[1]');
  });

  it('includes snippet (truncated to 300)', () => {
    const longSnippet = 'a'.repeat(500);
    const results = [
      makeResult('Test', 'https://example.com', longSnippet, 3),
    ];

    const hint = buildPromptHint('test', results);

    expect(hint).toContain('a'.repeat(300));
    expect(hint).not.toContain('a'.repeat(301));
  });

  it('includes usage instructions at end', () => {
    const results = [
      makeResult('Test', 'https://example.com', 'Snippet', 3),
    ];

    const hint = buildPromptHint('test', results);

    expect(hint).toContain('concise, factual answer');
    expect(hint).toContain('citations using [1], [2]');
    expect(hint).toContain('insufficient, contradictory, or lack');
  });
});