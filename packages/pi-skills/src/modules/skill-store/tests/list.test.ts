// eslint-disable-next-line montflow/no-node-platform-imports -- test fixture writes temp SKILL.md files.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: temp dir joins.
import { join } from 'node:path';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: os temp dir.
import { tmpdir } from 'node:os';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as SkillStore from '../index.js';

/** One fixture skill file under the temp store. */
interface Fixture {
  readonly id: string;
  readonly raw: string;
}

const file = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nBody for ${name}.\n`;

/**
 * Build a temp workspace root holding the fixture skills, run `use`,
 * then remove the root on every exit path.
 * @param fixtures - skill files to write
 * @param use - work receiving the temp root
 * @returns the work result
 */
const withStore = <A, E>(
  fixtures: ReadonlyArray<Fixture>,
  use: (root: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), 'pi-skills-store-'))).pipe(
      Effect.flatMap((root) =>
        Effect.promise(() =>
          Promise.all(
            fixtures.map((fixture) =>
              mkdir(join(root, '.agents', 'skills', fixture.id), { recursive: true }).then(() =>
                writeFile(join(root, '.agents', 'skills', fixture.id, 'SKILL.md'), fixture.raw),
              ),
            ),
          ).then(() => root),
        ),
      ),
    ),
    use,
    (root) =>
      Effect.promise(() => rm(root, { recursive: true, force: true }).then(() => undefined)),
  );

Vitest.describe('SkillStore.list', () => {
  Vitest.it.effect('lists rows sorted by name and skips malformed files', () =>
    withStore(
      [
        { id: 'beta', raw: file('beta', 'Second.') },
        { id: 'alpha', raw: file('alpha', 'First.') },
        { id: 'broken', raw: '# No frontmatter here.\n' },
      ],
      (root) =>
        Effect.gen(function* () {
          const skills = yield* SkillStore.list(root);
          Vitest.expect(skills.map((skill) => skill.id)).toStrictEqual(['alpha', 'beta']);
          Vitest.expect(skills[0]?.body).toBe('Body for alpha.');
        }),
    ),
  );

  Vitest.it.effect('reads a missing store as empty', () =>
    withStore([], (root) =>
      Effect.gen(function* () {
        const skills = yield* SkillStore.list(join(root, 'elsewhere'));
        Vitest.expect(skills).toStrictEqual([]);
      }),
    ),
  );

  Vitest.it.effect('falls back to the directory name when name is blank', () =>
    withStore([{ id: 'nameless', raw: '---\ndescription: No name.\n---\n\nBody.\n' }], (root) =>
      Effect.gen(function* () {
        const skills = yield* SkillStore.list(root);
        Vitest.expect(skills.map((skill) => skill.name)).toStrictEqual(['nameless']);
      }),
    ),
  );
});
