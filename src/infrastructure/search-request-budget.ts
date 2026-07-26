export type SearchBudgetDimension =
  | 'engine_calls'
  | 'elapsed_ms'
  | 'result_count'
  | 'evidence_chars';

export interface SearchRequestBudgetLimits {
  engine_calls: number;
  elapsed_ms: number;
  result_count: number;
  evidence_chars: number;
}

export interface SearchRequestBudgetSnapshot {
  limits: SearchRequestBudgetLimits;
  observed: SearchRequestBudgetLimits;
  exhausted: boolean;
  exhausted_reasons: SearchBudgetDimension[];
}

export class SearchRequestBudget {
  readonly signal: AbortSignal;
  private readonly startedAt = Date.now();
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly abortFromCaller?: () => void;
  private engineCalls = 0;
  private resultCount = 0;
  private evidenceChars = 0;
  private readonly exhaustedReasons = new Set<SearchBudgetDimension>();

  constructor(
    readonly limits: SearchRequestBudgetLimits,
    private readonly callerSignal?: AbortSignal,
  ) {
    if (callerSignal) {
      this.abortFromCaller = () => {
        if (!this.controller.signal.aborted) {
          this.controller.abort(callerSignal.reason);
        }
      };
      if (callerSignal.aborted) this.abortFromCaller();
      else callerSignal.addEventListener('abort', this.abortFromCaller, { once: true });
    }
    this.signal = this.controller.signal;
    this.timer = setTimeout(() => {
      this.exhaust('elapsed_ms');
    }, limits.elapsed_ms);
    this.timer.unref?.();
  }

  claimEngineCall(): boolean {
    this.refreshElapsed();
    if (this.isHardExhausted()) return false;
    if (this.engineCalls >= this.limits.engine_calls) {
      this.exhaust('engine_calls');
      return false;
    }
    this.engineCalls += 1;
    return true;
  }

  admitResults<T>(results: T[]): T[] {
    this.refreshElapsed();
    const remaining = Math.max(this.limits.result_count - this.resultCount, 0);
    const admitted = results.slice(0, remaining);
    this.resultCount += admitted.length;
    if (admitted.length < results.length || this.resultCount >= this.limits.result_count) {
      this.exhaust('result_count');
    }
    return admitted;
  }

  observeEvidence(used: number, truncated: boolean): void {
    this.evidenceChars = Math.max(0, used);
    if (truncated || used >= this.limits.evidence_chars) {
      this.exhaust('evidence_chars', false);
    }
  }

  canContinue(): boolean {
    this.callerSignal?.throwIfAborted();
    this.refreshElapsed();
    return !this.isHardExhausted();
  }

  isBudgetAbort(): boolean {
    return this.controller.signal.aborted && !this.callerSignal?.aborted;
  }

  snapshot(): SearchRequestBudgetSnapshot {
    this.refreshElapsed();
    return {
      limits: { ...this.limits },
      observed: {
        engine_calls: this.engineCalls,
        elapsed_ms: Math.max(0, Date.now() - this.startedAt),
        result_count: this.resultCount,
        evidence_chars: this.evidenceChars,
      },
      exhausted: this.exhaustedReasons.size > 0,
      exhausted_reasons: [...this.exhaustedReasons],
    };
  }

  dispose(): void {
    clearTimeout(this.timer);
    if (this.abortFromCaller) {
      this.callerSignal?.removeEventListener('abort', this.abortFromCaller);
    }
  }

  private refreshElapsed(): void {
    if (Date.now() - this.startedAt >= this.limits.elapsed_ms) {
      this.exhaust('elapsed_ms');
    }
  }

  private isHardExhausted(): boolean {
    return [...this.exhaustedReasons].some(reason => reason !== 'evidence_chars');
  }

  private exhaust(reason: SearchBudgetDimension, abort = true): void {
    this.exhaustedReasons.add(reason);
    if (abort && !this.controller.signal.aborted) {
      this.controller.abort(new Error(`Search request budget exhausted: ${reason}`));
    }
  }
}
