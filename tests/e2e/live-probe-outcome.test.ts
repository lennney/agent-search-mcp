import { describe, expect, it } from 'vitest';

import {
  hasSuccessfulProviderProbe,
  isBotChallengeFailure,
  shouldStopAfterLiveOutcome,
} from './live-probe-outcome.js';

describe('isBotChallengeFailure', () => {
  it('recognizes a direct partial failure', () => {
    expect(isBotChallengeFailure({
      engine: 'bing',
      type: 'bot_challenge',
      message: 'verification required',
    })).toBe(true);
  });

  it('recognizes a challenge nested in partialFailures', () => {
    expect(isBotChallengeFailure({
      partialFailures: [
        { engine: 'bing', type: 'parse_error' },
        { engine: 'baidu', type: 'bot_challenge' },
      ],
    })).toBe(true);
  });

  it('recognizes a challenge in a nested live outcome', () => {
    expect(isBotChallengeFailure({
      result: {
        partialFailures: [{ engine: 'yandex', type: 'bot_challenge' }],
      },
    })).toBe(true);
  });

  it('does not classify ordinary parse errors or non-objects as challenges', () => {
    expect(isBotChallengeFailure({
      engine: 'bing',
      type: 'parse_error',
    })).toBe(false);
    expect(isBotChallengeFailure(null)).toBe(false);
    expect(isBotChallengeFailure('bot_challenge')).toBe(false);
  });
});

describe('shouldStopAfterLiveOutcome', () => {
  it('stops after a provider challenge', () => {
    expect(shouldStopAfterLiveOutcome({
      partialFailures: [{ engine: 'bing', type: 'bot_challenge' }],
    })).toBe(true);
  });

  it('does not stop after a successful result or parse error', () => {
    expect(shouldStopAfterLiveOutcome({
      results: [{ title: 'Result', url: 'https://example.com' }],
    })).toBe(false);
    expect(shouldStopAfterLiveOutcome({
      partialFailures: [{ engine: 'bing', type: 'parse_error' }],
    })).toBe(false);
  });
});

describe('hasSuccessfulProviderProbe', () => {
  it('counts only a successful provider probe with non-empty results', () => {
    expect(hasSuccessfulProviderProbe({
      kind: 'provider',
      success: true,
      results: [{ title: 'Result', url: 'https://example.com' }],
    })).toBe(true);
  });

  it('does not count an empty provider result as coverage', () => {
    expect(hasSuccessfulProviderProbe({
      kind: 'provider',
      success: true,
      results: [],
    })).toBe(false);
  });

  it('does not count extract results as provider coverage', () => {
    expect(hasSuccessfulProviderProbe({
      kind: 'extract',
      success: true,
      results: [{ title: 'Extracted page' }],
    })).toBe(false);
  });

  it('does not count a challenged provider probe as coverage', () => {
    expect(hasSuccessfulProviderProbe({
      kind: 'provider',
      success: false,
      results: [],
      partialFailures: [{ engine: 'bing', type: 'bot_challenge' }],
    })).toBe(false);
  });
});
