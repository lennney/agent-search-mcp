import { describe, expect, it, vi } from 'vitest';
import { SearchRequestBudget } from '../../src/infrastructure/search-request-budget.js';

const limits = {
  engine_calls: 2,
  elapsed_ms: 1_000,
  result_count: 3,
  evidence_chars: 20,
};

describe('SearchRequestBudget', () => {
  it('counts actual engine attempts and rejects work beyond the limit', () => {
    const budget = new SearchRequestBudget(limits);
    expect(budget.claimEngineCall()).toBe(true);
    expect(budget.claimEngineCall()).toBe(true);
    expect(budget.claimEngineCall()).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      observed: { engine_calls: 2 },
      exhausted: true,
      exhausted_reasons: ['engine_calls'],
    });
    budget.dispose();
  });

  it('admits only the remaining raw-result capacity', () => {
    const budget = new SearchRequestBudget(limits);
    expect(budget.admitResults([1, 2])).toEqual([1, 2]);
    expect(budget.admitResults([3, 4])).toEqual([3]);
    expect(budget.canContinue()).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      observed: { result_count: 3 },
      exhausted_reasons: ['result_count'],
    });
    budget.dispose();
  });

  it('does not exhaust the result budget when a batch exactly fits', () => {
    const budget = new SearchRequestBudget(limits);
    expect(budget.admitResults([1, 2, 3])).toEqual([1, 2, 3]);
    expect(budget.canContinue()).toBe(false);
    expect(budget.snapshot()).toMatchObject({
      observed: { result_count: 3 },
      exhausted: false,
      exhausted_reasons: [],
    });
    budget.dispose();
  });

  it('marks evidence-limit saturation without aborting execution', () => {
    const budget = new SearchRequestBudget(limits);
    budget.observeEvidence(20);
    expect(budget.canContinue()).toBe(true);
    expect(budget.snapshot()).toMatchObject({
      observed: { evidence_chars: 20 },
      exhausted_reasons: ['evidence_chars'],
    });
    budget.dispose();
  });

  it('does not exhaust evidence when observed usage remains below the limit', () => {
    const budget = new SearchRequestBudget(limits);
    budget.observeEvidence(11);
    expect(budget.snapshot()).toMatchObject({
      observed: { evidence_chars: 11 },
      exhausted: false,
      exhausted_reasons: [],
    });
    budget.dispose();
  });

  it('aborts in-flight work when the elapsed-time envelope expires', async () => {
    vi.useFakeTimers();
    const budget = new SearchRequestBudget({ ...limits, elapsed_ms: 50 });
    const aborted = new Promise(resolve => {
      budget.signal.addEventListener('abort', resolve, { once: true });
    });
    await vi.advanceTimersByTimeAsync(50);
    await aborted;
    expect(budget.isBudgetAbort()).toBe(true);
    expect(budget.snapshot().exhausted_reasons).toContain('elapsed_ms');
    budget.dispose();
    vi.useRealTimers();
  });

  it('preserves caller cancellation as distinct from budget exhaustion', () => {
    const caller = new AbortController();
    const budget = new SearchRequestBudget(limits, caller.signal);
    caller.abort(new Error('cancelled by caller'));
    expect(() => budget.canContinue()).toThrow('cancelled by caller');
    expect(budget.isBudgetAbort()).toBe(false);
    budget.dispose();
  });
});
