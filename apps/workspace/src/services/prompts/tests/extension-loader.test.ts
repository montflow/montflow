import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

Vitest.describe('Prompts extension loader', () => {
  Vitest.it.effect('loads the runtime lazily and caches it', () =>
    Effect.gen(function* () {
      const first = yield* Prompts.loadPiPrompts();
      const second = yield* Prompts.loadPiPrompts();
      Vitest.expect(second).toBe(first);
      Vitest.expect(first.Interactive.CANCELLED).toBe('Cancelled.');
      Vitest.expect(first.Prompts.make('demo', 'Hello').name).toBe('demo');
    }),
  );

  Vitest.it.effect('exposes the shared matcher once loaded', () =>
    Effect.gen(function* () {
      yield* Prompts.loadPiPrompts();
      const matcher = Prompts.loadedMatcher();
      Vitest.expect(matcher?.('anthropic/claude-sonnet-4-5', 'sonnet')).toBe(true);
      Vitest.expect(matcher?.('anthropic/claude-sonnet-4-5', 'zzz')).toBe(false);
    }),
  );

  Vitest.it('classifies network failures', () => {
    const error = Prompts.classifyLoadError(new Error('fetch failed'));
    Vitest.expect(error.cause).toBe('network');
    Vitest.expect(error.message).toContain('network');
  });

  Vitest.it('classifies missing runtimes', () => {
    const error = Prompts.classifyLoadError(new Error("Cannot find module '@montflow/pi-prompts'"));
    Vitest.expect(error.cause).toBe('missing');
    Vitest.expect(error.message).toContain('not found');
  });

  Vitest.it('classifies anything else as unknown', () => {
    const error = Prompts.classifyLoadError(new Error('boom'));
    Vitest.expect(error.cause).toBe('unknown');
  });

  Vitest.it.effect('reset drops the cache so the next load re-imports', () =>
    Effect.gen(function* () {
      yield* Prompts.loadPiPrompts();
      Prompts.resetExtensionCache();
      Vitest.expect(Prompts.loadedPiPrompts()).toBe(undefined);
      const reloaded = yield* Prompts.loadPiPrompts();
      Vitest.expect(reloaded.Interactive.CANCELLED).toBe('Cancelled.');
    }),
  );
});
