import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';

/** A body carrying the three sections the verifier requires. */
const BODY = '# When To Use\n\ndemo.\n\n# Pipeline\n\n1. do it.\n\n# Reference\n\n- none.\n';

/** A throwaway workspace root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-skills-list-'));

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(() => rm(root, { recursive: true, force: true }));

/** Seed one verifying skill and one that decodes but fails verification. */
const seed = (root: string): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    yield* Engines.create(
      { cwd: root },
      {
        name: 'good',
        description: 'A skill that verifies clean.',
        body: BODY,
        author: undefined,
        version: undefined,
        license: undefined,
        groups: [],
        dependencies: [],
      },
    );
    const dir = join(root, '.agents', 'skills', 'bad');
    yield* Effect.promise(() => mkdir(dir, { recursive: true }));
    yield* Effect.promise(() =>
      writeFile(
        join(dir, 'SKILL.md'),
        '---\nname: bad\ndescription: A skill missing the required sections.\n---\n\nno sections here\n',
      ),
    );
  });

const withRoot = <A>(run: (root: string) => Effect.Effect<A, string>): Effect.Effect<A, string> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(freshRoot);
    yield* seed(root);
    const value = yield* run(root);
    yield* cleanup(root);
    return value;
  });

Vitest.describe('Engines.list status filter', () => {
  Vitest.it.effect('returns every skill when no status is given', () =>
    withRoot((root) =>
      Effect.gen(function* () {
        const skills = yield* Engines.list({ cwd: root });
        Vitest.expect(skills.map((skill) => skill.id)).toStrictEqual(['bad', 'good']);
      }),
    ),
  );

  Vitest.it.effect('--status valid keeps only skills that verify', () =>
    withRoot((root) =>
      Effect.gen(function* () {
        const skills = yield* Engines.list({ cwd: root }, { status: 'valid' });
        Vitest.expect(skills.map((skill) => skill.id)).toStrictEqual(['good']);
      }),
    ),
  );

  Vitest.it.effect('--status invalid keeps only skills that fail verification', () =>
    withRoot((root) =>
      Effect.gen(function* () {
        const skills = yield* Engines.list({ cwd: root }, { status: 'invalid' });
        Vitest.expect(skills.map((skill) => skill.id)).toStrictEqual(['bad']);
      }),
    ),
  );
});

Vitest.describe('Engines.resolveListStatus runtime', () => {
  Vitest.it('treats an absent or empty value as no filter', () => {
    Vitest.expect(Engines.resolveListStatus(undefined).pipe(Effect.runSync)).toBeUndefined();
    Vitest.expect(Engines.resolveListStatus('').pipe(Effect.runSync)).toBeUndefined();
  });

  Vitest.it('accepts the two verification states', () => {
    Vitest.expect(Engines.resolveListStatus('valid').pipe(Effect.runSync)).toBe('valid');
    Vitest.expect(Engines.resolveListStatus('invalid').pipe(Effect.runSync)).toBe('invalid');
  });

  Vitest.it.effect('rejects an unknown status, naming the accepted values', () =>
    Effect.gen(function* () {
      const error = yield* Engines.resolveListStatus('bogus').pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown status 'bogus'");
      Vitest.expect(error).toContain('valid, invalid');
    }),
  );
});

Vitest.describe('Renderers.list empty messages', () => {
  Vitest.it('names the filter when nothing matches', () => {
    Vitest.expect(Renderers.list([], { status: 'valid' })).toBe("No skills with status 'valid'.");
  });
});
