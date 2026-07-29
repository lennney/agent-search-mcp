export interface LiveProbeBudget {
  claim(): boolean;
  readonly used: number;
  readonly exhausted: boolean;
}

/** Track bounded live requests without turning an expected skip into a failure. */
export function createLiveProbeBudget(limit: number): LiveProbeBudget {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('Live probe limit must be a positive integer');
  }

  let requestCount = 0;
  return {
    claim(): boolean {
      if (requestCount >= limit) return false;
      requestCount += 1;
      return true;
    },
    get used(): number {
      return requestCount;
    },
    get exhausted(): boolean {
      return requestCount >= limit;
    },
  };
}
