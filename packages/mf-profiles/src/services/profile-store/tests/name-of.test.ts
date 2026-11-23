import * as Vitest from '@effect/vitest';
import { NodePath } from '@effect/platform-node';
import { Effect, Path } from 'effect';
import { ProfileStore } from '../index.js';

const ROOT = '/repo/.agents/@montflow/profiles';

Vitest.describe('ProfileStore.nameOf', () => {
  Vitest.it.effect('names the profile a watched path belongs to', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      Vitest.expect(ProfileStore.nameOf(path, ROOT, 'code-reviewer')).toBe('code-reviewer');
      Vitest.expect(ProfileStore.nameOf(path, ROOT, 'code-reviewer/PROFILE.md')).toBe(
        'code-reviewer',
      );
      Vitest.expect(ProfileStore.nameOf(path, ROOT, `${ROOT}/code-reviewer/PROFILE.md`)).toBe(
        'code-reviewer',
      );
    }).pipe(Effect.provide(NodePath.layer)),
  );

  Vitest.it.effect('ignores paths that are not a profile entry', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      Vitest.expect(ProfileStore.nameOf(path, ROOT, '')).toBeUndefined();
      Vitest.expect(ProfileStore.nameOf(path, ROOT, 'TEMPLATE.md')).toBeUndefined();
      Vitest.expect(ProfileStore.nameOf(path, ROOT, '../other/x')).toBeUndefined();
      Vitest.expect(ProfileStore.nameOf(path, ROOT, '/elsewhere/x')).toBeUndefined();
    }).pipe(Effect.provide(NodePath.layer)),
  );
});
