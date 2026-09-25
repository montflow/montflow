import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Runs from '../index.js';

Vitest.afterEach(() => {
  Runs.resetExtensionCache();
});

Vitest.describe('Runs extension loader', () => {
  Vitest.it.effect('loads the runtime lazily and caches it', () =>
    Effect.gen(function* () {
      Vitest.expect(Runs.loadedPiRuns()).toBeUndefined();
      const first = yield* Runs.loadPiRuns();
      Vitest.expect(Runs.loadedPiRuns()).toBe(first);
      const second = yield* Runs.loadPiRuns();
      Vitest.expect(second).toBe(first);
      Vitest.expect(first.Store.RUNS_SEGMENTS).toStrictEqual([
        '.agents',
        '@montflow',
        'pi-runs',
        'runs',
      ]);
    }),
  );

  Vitest.it('classifies network failures', () => {
    const error = Runs.classifyLoadError(new Error('fetch failed'));
    Vitest.expect(error.cause).toBe('network');
    Vitest.expect(error.message).toContain('network');
  });

  Vitest.it('classifies missing runtimes', () => {
    const error = Runs.classifyLoadError(new Error("Cannot find module '@montflow/pi-runs'"));
    Vitest.expect(error.cause).toBe('missing');
    Vitest.expect(error.message).toContain('not found');
  });

  Vitest.it('classifies anything else as unknown', () => {
    const error = Runs.classifyLoadError(new Error('boom'));
    Vitest.expect(error.cause).toBe('unknown');
    Vitest.expect(Runs.loadErrorMessage('unknown')).toContain('failed to load');
  });

  Vitest.it.effect('reset drops the cache so the next load re-imports', () =>
    Effect.gen(function* () {
      yield* Runs.loadPiRuns();
      Runs.resetExtensionCache();
      Vitest.expect(Runs.loadedPiRuns()).toBeUndefined();
      const reloaded = yield* Runs.loadPiRuns();
      Vitest.expect(reloaded.Store.RUNS_SEGMENTS).toContain('pi-runs');
    }),
  );
});
