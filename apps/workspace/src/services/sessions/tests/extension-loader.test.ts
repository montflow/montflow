import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Sessions from '../index.js';

Vitest.afterEach(() => {
  Sessions.resetExtensionCache();
});

Vitest.describe('Sessions extension loader', () => {
  Vitest.it.effect('loads the runtime lazily and caches it', () =>
    Effect.gen(function* () {
      Vitest.expect(Sessions.loadedPiSessions()).toBeUndefined();
      const first = yield* Sessions.loadPiSessions();
      Vitest.expect(Sessions.loadedPiSessions()).toBe(first);
      const second = yield* Sessions.loadPiSessions();
      Vitest.expect(second).toBe(first);
      Vitest.expect(first.Store.SESSIONS_SEGMENTS).toStrictEqual([
        '.agents',
        '@montflow',
        'sessions',
      ]);
    }),
  );

  Vitest.it('classifies network failures', () => {
    const error = Sessions.classifyLoadError(new Error('fetch failed'));
    Vitest.expect(error.cause).toBe('network');
    Vitest.expect(error.message).toContain('network');
  });

  Vitest.it('classifies missing runtimes', () => {
    const error = Sessions.classifyLoadError(
      new Error("Cannot find module '@montflow/pi-sessions'"),
    );
    Vitest.expect(error.cause).toBe('missing');
    Vitest.expect(error.message).toContain('not found');
  });

  Vitest.it('classifies anything else as unknown', () => {
    const error = Sessions.classifyLoadError(new Error('boom'));
    Vitest.expect(error.cause).toBe('unknown');
    Vitest.expect(Sessions.loadErrorMessage('unknown')).toContain('failed to load');
  });

  Vitest.it.effect('reset drops the cache so the next load re-imports', () =>
    Effect.gen(function* () {
      yield* Sessions.loadPiSessions();
      Sessions.resetExtensionCache();
      Vitest.expect(Sessions.loadedPiSessions()).toBeUndefined();
      const reloaded = yield* Sessions.loadPiSessions();
      Vitest.expect(reloaded.Store.SESSIONS_SEGMENTS).toContain('sessions');
    }),
  );
});
