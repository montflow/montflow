import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

Vitest.describe('Skills extension loader', () => {
  Vitest.it.effect('loads the runtime lazily and caches it', () =>
    Effect.gen(function* () {
      const first = yield* Skills.loadSkills();
      const second = yield* Skills.loadSkills();
      Vitest.expect(second).toBe(first);
      Vitest.expect(first.Interactive.CANCELLED).toBe('Cancelled.');
      Vitest.expect(first.Skill.GENERATION_REQUIREMENTS).toContain('montflow-create-skills');
    }),
  );

  Vitest.it.effect('exposes the shared matcher once loaded', () =>
    Effect.gen(function* () {
      yield* Skills.loadSkills();
      const matcher = Skills.loadedMatcher();
      Vitest.expect(matcher?.('authoring-skills', 'auth')).toBe(true);
      Vitest.expect(matcher?.('authoring-skills', 'zzz')).toBe(false);
    }),
  );

  Vitest.it.effect('exposes the async skill store once loaded', () =>
    Effect.gen(function* () {
      const libs = yield* Skills.loadSkills();
      Vitest.expect(libs.SkillStore.list).toBeDefined();
      Vitest.expect(libs.SkillStore.skillsDir('/root')).toContain('.agents');
    }),
  );

  Vitest.it('classifies network failures', () => {
    const error = Skills.classifyLoadError(new Error('fetch failed'));
    Vitest.expect(error.cause).toBe('network');
    Vitest.expect(error.message).toContain('network');
  });

  Vitest.it('classifies missing runtimes', () => {
    const error = Skills.classifyLoadError(new Error("Cannot find module '@montflow/skills'"));
    Vitest.expect(error.cause).toBe('missing');
    Vitest.expect(error.message).toContain('not found');
  });

  Vitest.it('classifies anything else as unknown', () => {
    const error = Skills.classifyLoadError(new Error('boom'));
    Vitest.expect(error.cause).toBe('unknown');
  });

  Vitest.it.effect('reset drops the cache so the next load re-imports', () =>
    Effect.gen(function* () {
      yield* Skills.loadSkills();
      Skills.resetExtensionCache();
      Vitest.expect(Skills.loadedSkills()).toBe(undefined);
      const reloaded = yield* Skills.loadSkills();
      Vitest.expect(reloaded.Interactive.CANCELLED).toBe('Cancelled.');
    }),
  );
});
