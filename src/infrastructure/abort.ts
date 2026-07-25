/** Combine a caller-owned cancellation signal with an operation timeout. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;
  if (signal.aborted) return signal;

  const controller = new AbortController();
  const abortFromCaller = () => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  const abortFromTimeout = () => {
    if (!controller.signal.aborted) controller.abort(timeoutSignal.reason);
  };
  const cleanup = () => {
    signal.removeEventListener('abort', abortFromCaller);
    timeoutSignal.removeEventListener('abort', abortFromTimeout);
  };
  signal.addEventListener('abort', abortFromCaller, { once: true });
  timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true });
  controller.signal.addEventListener('abort', cleanup, { once: true });
  return controller.signal;
}

export async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
