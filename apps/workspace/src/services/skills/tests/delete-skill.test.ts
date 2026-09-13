import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Skills from '../index.js';

const makeRoot = (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'workspace-skills-')).then((root) =>
    mkdir(join(root, '.agents', 'skills', 'demo'), { recursive: true })
      .then(() => writeFile(join(root, '.agents', 'skills', 'demo', 'SKILL.md'), '---\n---\nbody'))
      .then(() => root),
  );

Vitest.describe('Skills.isValidSkillId runtime', () => {
  Vitest.it('accepts directory-safe slugs', () => {
    Vitest.expect(Skills.isValidSkillId('cooking-pasta')).toStrictEqual(true);
  });

  Vitest.it('rejects blanks, traversal, and separators', () => {
    for (const id of ['', '..', '../x', 'a/b', 'UPPER', 'has space', 'x'.repeat(65)])
      Vitest.expect(Skills.isValidSkillId(id)).toStrictEqual(false);
  });
});

Vitest.describe('Skills.deleteSkill runtime', () => {
  Vitest.it('removes the skill directory', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeRoot);
      yield* Skills.deleteSkill(root, 'demo');
      const missing = yield* Effect.promise(() =>
        stat(join(root, '.agents', 'skills', 'demo')).then(
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
      const error = yield* Skills.deleteSkill(root, '../escape').pipe(Effect.flip);
      Vitest.expect(error.message).toContain('unsafe');
      const kept = yield* Effect.promise(() =>
        stat(join(root, '.agents', 'skills', 'demo')).then(
          () => true,
          () => false,
        ),
      );
      Vitest.expect(kept).toStrictEqual(true);
    }).pipe(Effect.runPromise),
  );
});
