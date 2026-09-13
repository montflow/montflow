import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Profiles from '../index.js';

const makeRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'workspace-profiles-')).then((root) =>
    mkdir(join(root, '.agents', '@montflow', 'pi-profiles', 'demo'), { recursive: true })
      .then(() =>
        writeFile(
          join(root, '.agents', '@montflow', 'pi-profiles', 'demo', 'PROFILE.md'),
          '---\nname: demo\ndescription: demo profile\n---\n',
        ),
      )
      .then(() => root),
  );

Vitest.describe('Profiles.isValidProfileId runtime', () => {
  Vitest.it('accepts directory-safe slugs', () => {
    Vitest.expect(Profiles.isValidProfileId('code-reviewer')).toStrictEqual(true);
  });

  Vitest.it('rejects blanks, traversal, and separators', () => {
    for (const id of [
      '',
      '..',
      '../x',
      'a/b',
      'UPPER',
      'has space',
      '-lead',
      'trail-',
      'x'.repeat(65),
    ])
      Vitest.expect(Profiles.isValidProfileId(id)).toStrictEqual(false);
  });
});

Vitest.describe('Profiles.installProfiles runtime', () => {
  Vitest.it('seeds the store directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'workspace-profiles-')));
      yield* Profiles.installProfiles(root);
      const present = yield* Effect.promise(() =>
        stat(join(root, '.agents', '@montflow', 'pi-profiles')).then(
          () => true,
          () => false,
        ),
      );
      Vitest.expect(present).toStrictEqual(true);
      const installed = yield* Profiles.isStoreInstalled(root);
      Vitest.expect(installed).toStrictEqual(true);
    }).pipe(Effect.runPromise),
  );

  Vitest.it('reads a missing store as not installed', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'workspace-profiles-')));
      Vitest.expect(yield* Profiles.isStoreInstalled(root)).toStrictEqual(false);
    }).pipe(Effect.runPromise),
  );
});

Vitest.describe('Profiles.deleteProfile runtime', () => {
  Vitest.it('removes the profile directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeRoot);
      yield* Profiles.deleteProfile(root, 'demo');
      const missing = yield* Effect.promise(() =>
        stat(join(root, '.agents', '@montflow', 'pi-profiles', 'demo')).then(
          () => false,
          () => true,
        ),
      );
      Vitest.expect(missing).toStrictEqual(true);
    }).pipe(Effect.runPromise),
  );

  Vitest.it('refuses unsafe ids without touching the store', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeRoot);
      const error = yield* Profiles.deleteProfile(root, '../escape').pipe(Effect.flip);
      Vitest.expect(error.message).toContain('unsafe');
      const kept = yield* Effect.promise(() =>
        stat(join(root, '.agents', '@montflow', 'pi-profiles', 'demo')).then(
          () => true,
          () => false,
        ),
      );
      Vitest.expect(kept).toStrictEqual(true);
    }).pipe(Effect.runPromise),
  );
});
