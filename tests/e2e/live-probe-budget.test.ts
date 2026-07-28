import { describe, expect, it } from 'vitest';

import { createLiveProbeBudget } from './live-probe-budget.js';

describe('createLiveProbeBudget', () => {
  it('allows claims up to the limit without throwing after exhaustion', () => {
    const budget = createLiveProbeBudget(2);

    expect(budget.claim()).toBe(true);
    expect(budget.claim()).toBe(true);
    expect(budget.claim()).toBe(false);
    expect(budget.used).toBe(2);
    expect(budget.exhausted).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid limit %s with RangeError',
    (limit) => {
      expect(() => createLiveProbeBudget(limit)).toThrow(RangeError);
    },
  );
});
