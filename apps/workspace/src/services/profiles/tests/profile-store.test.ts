import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Profiles from '../index.js';

const makeRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'workspace-profiles-')).then((root) =>
    mkdir(join(root, '.agents', '@montflow', 'profiles', 'demo'), { recursive: true })
      .then(() =>
        writeFile(
          join(root, '.agents', '@montflow', 'profiles', 'demo', 'PROFILE.md'),
          '---\nname: demo\ndescription: demo profile\n---\n',
        ),
      )
      .then(() => root),
  );

/** Canonical, fully valid `PROFILE.md` contents for the verify tests. */
const VALID_PROFILE = `---
name: demo
description: demo profile
---

# Demo

## Instructions

Do the thing.

## Review Checklist

- [ ] Check it.
`;

/** Seed a store root with one raw `PROFILE.md` written verbatim. */
const makeRawRoot = (id: string, raw: string): Promise<string> =>
  mkdtemp(join(tmpdir(), 'workspace-profiles-')).then((root) =>
    mkdir(join(root, '.agents', '@montflow', 'profiles', id), { recursive: true })
      .then(() => writeFile(join(root, '.agents', '@montflow', 'profiles', id, 'PROFILE.md'), raw))
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
        stat(join(root, '.agents', '@montflow', 'profiles')).then(
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

Vitest.describe('Profiles.verifyProfile runtime', () => {
  Vitest.it.effect('reports a canonical profile as valid with no issues', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => makeRawRoot('demo', VALID_PROFILE));
      const result = yield* Profiles.verifyProfile(root, 'demo');
      Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
    }),
  );

  Vitest.it.effect('reports a malformed profile as invalid with issues', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => makeRawRoot('demo', 'not a profile'));
      const result = yield* Profiles.verifyProfile(root, 'demo');
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.length).toBeGreaterThan(0);
    }),
  );

  Vitest.it.effect('fails on an unknown id', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => makeRawRoot('demo', VALID_PROFILE));
      const error = yield* Profiles.verifyProfile(root, 'missing').pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown profile 'missing'");
    }),
  );

  Vitest.it.effect('fails on an unsafe id without reading the store', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => makeRawRoot('demo', VALID_PROFILE));
      const error = yield* Profiles.verifyProfile(root, '../escape').pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown profile '../escape'");
    }),
  );
});

Vitest.describe('Profiles.deleteProfile runtime', () => {
  Vitest.it('removes the profile directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeRoot);
      yield* Profiles.deleteProfile(root, 'demo');
      const missing = yield* Effect.promise(() =>
        stat(join(root, '.agents', '@montflow', 'profiles', 'demo')).then(
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
        stat(join(root, '.agents', '@montflow', 'profiles', 'demo')).then(
          () => true,
          () => false,
        ),
      );
      Vitest.expect(kept).toStrictEqual(true);
    }).pipe(Effect.runPromise),
  );
});
