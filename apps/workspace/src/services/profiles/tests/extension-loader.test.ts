import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

Vitest.describe('Profiles extension loader', () => {
  Vitest.it.effect('loads the runtime lazily and caches it', () =>
    Effect.gen(function* () {
      const first = yield* Profiles.loadProfiles();
      const second = yield* Profiles.loadProfiles();
      Vitest.expect(second).toBe(first);
      Vitest.expect(first.Interactive.CANCELLED).toBe('Cancelled.');
      Vitest.expect(first.Profiles.GENERATION_REQUIREMENTS).toContain('montflow-create-profiles');
    }),
  );

  Vitest.it.effect('exposes the shared matcher once loaded', () =>
    Effect.gen(function* () {
      yield* Profiles.loadProfiles();
      const matcher = Profiles.loadedMatcher();
      Vitest.expect(matcher?.('anthropic/claude-sonnet-4-5', 'sonnet')).toBe(true);
      Vitest.expect(matcher?.('anthropic/claude-sonnet-4-5', 'zzz')).toBe(false);
    }),
  );

  Vitest.it('classifies network failures', () => {
    const error = Profiles.classifyLoadError(new Error('fetch failed'));
    Vitest.expect(error.cause).toBe('network');
    Vitest.expect(error.message).toContain('network');
  });

  Vitest.it('classifies missing runtimes', () => {
    const error = Profiles.classifyLoadError(new Error("Cannot find module '@montflow/profiles'"));
    Vitest.expect(error.cause).toBe('missing');
    Vitest.expect(error.message).toContain('not found');
  });

  Vitest.it('classifies anything else as unknown', () => {
    const error = Profiles.classifyLoadError(new Error('boom'));
    Vitest.expect(error.cause).toBe('unknown');
  });

  Vitest.it.effect('reset drops the cache so the next load re-imports', () =>
    Effect.gen(function* () {
      yield* Profiles.loadProfiles();
      Profiles.resetExtensionCache();
      Vitest.expect(Profiles.loadedProfiles()).toBe(undefined);
      const reloaded = yield* Profiles.loadProfiles();
      Vitest.expect(reloaded.Interactive.CANCELLED).toBe('Cancelled.');
    }),
  );
});
