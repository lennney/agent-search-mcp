import { describe, expect, it, vi } from 'vitest';
const captured = vi.hoisted(() => ({ options: undefined as any }));
vi.mock('pino', () => ({ default: Object.assign((options: unknown) => {
  captured.options = options; return {};
}, { destination: () => ({}) }) }));
import '../../src/infrastructure/logger.js';
import { withSearchPrivacy } from '../../src/infrastructure/request-privacy.js';

describe('request-scoped logger privacy', () => {
  it('suppresses logs including asynchronous provider errors without mutating global logging', async () => {
    const sink = vi.fn();
    const log = (message: string) => captured.options.hooks.logMethod.call({}, [{ query: message }], sink);
    await Promise.all([
      withSearchPrivacy('no_retention', async () => {
        log('private query');
        await new Promise(resolve => setImmediate(resolve));
        log('private result or provider error');
      }),
      withSearchPrivacy('standard', async () => {
        await new Promise(resolve => setImmediate(resolve));
        log('public query');
      }),
    ]);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ query: 'public query' });
    log('outside request');
    expect(sink).toHaveBeenCalledTimes(2);
  });
});
