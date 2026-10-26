import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Slash from '../slash.apps.module.js';

/**
 * Flag grammar parity at the CLI boundary.
 *
 * The parser unit tests pin the accepted grammar; these tests check the
 * consequence: a malformed known command fails with `USAGE` before its engine
 * runs, so a bare `--dir` cannot delete or create in the session workspace.
 */

/** One temp area: the workspace the slash command resolves paths against. */
interface Sandbox {
  readonly root: string;
  readonly workspace: string;
}

/** Build a throwaway workspace and remove it afterwards. */
const withSandbox = <A, E>(use: (sandbox: Sandbox) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-skills-flags-'));
      const workspace = join(root, 'workspace');
      await mkdir(workspace, { recursive: true });
      return { root, workspace };
    }),
    use,
    (sandbox) =>
      Effect.promise(() =>
        rm(sandbox.root, { recursive: true, force: true }).then(() => undefined),
      ),
  );

/** A minimal SKILL.md, enough for `delete` and `list` to see a skill. */
const skillFile = (name: string): string =>
  `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n# When To Use\n\nBody.\n`;

/** Write a skill into a root's `.agents/skills` store. */
const writeSkill = (root: string, name: string): Promise<void> => {
  const file = join(root, '.agents', 'skills', name, 'SKILL.md');
  return mkdir(dirname(file), { recursive: true }).then(() => writeFile(file, skillFile(name)));
};

/** True when a path exists. */
const pathExists = (target: string): Promise<boolean> =>
  stat(target).then(
    () => true,
    () => false,
  );

/** Capture what a slash command notifies, in order. */
const recorder = () => {
  const messages: string[] = [];
  const ui: Slash.CliUi = {
    notify: (message) => {
      messages.push(message);
    },
  };
  return { ui, messages };
};

/** This package's root: the working directory `bun run --cwd packages/skills` uses. */
const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

/** Run `src/apps/cli/main.ts` the way a user does: the real binary, real argv. */
const runBinary = (args: ReadonlyArray<string>) => {
  const main = resolve(PACKAGE_ROOT, 'src/apps/cli/main.ts');
  const result = spawnSync('bun', ['run', main, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: `${result.stdout}${result.stderr}` };
};

Vitest.describe('slash flag grammar', () => {
  Vitest.it.effect('delete --dir refuses without deleting the skill', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.workspace, 'alpha'));
        const target = join(sandbox.workspace, '.agents', 'skills', 'alpha');
        const { ui, messages } = recorder();

        const failure = yield* Slash.run('delete alpha --dir', ui, sandbox.workspace).pipe(
          Effect.flip,
        );

        Vitest.expect(failure).toBe(Slash.USAGE);
        Vitest.expect(messages).toStrictEqual([]);
        Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(true);
      }),
    ),
  );

  Vitest.it.effect('create --dir refuses without creating a skill', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const { ui, messages } = recorder();

        const failure = yield* Slash.run(
          'create alpha --description "demo" --dir',
          ui,
          sandbox.workspace,
        ).pipe(Effect.flip);

        Vitest.expect(failure).toBe(Slash.USAGE);
        Vitest.expect(messages).toStrictEqual([]);
        Vitest.expect(
          yield* Effect.promise(() =>
            pathExists(join(sandbox.workspace, '.agents', 'skills', 'alpha')),
          ),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('malformed flags fail before any engine runs', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const cases = [
          'list --dir',
          'show alpha extra',
          'doctor --check=bogus',
          'list --verbose=bogus',
          'verify --verbose=bogus',
        ];
        for (const args of cases) {
          const { ui, messages } = recorder();
          const failure = yield* Slash.run(args, ui, sandbox.workspace).pipe(Effect.flip);
          Vitest.expect(failure).toBe(Slash.USAGE);
          Vitest.expect(messages).toStrictEqual([]);
        }
      }),
    ),
  );

  Vitest.it.effect('a malformed delete leaves an existing skill in place', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.workspace, 'alpha'));
        // `--dir` with no value is the dangerous shape: a parser that defaults
        // it would delete from the session workspace.
        const failure = yield* Slash.run(
          'delete alpha --dir',
          recorder().ui,
          sandbox.workspace,
        ).pipe(Effect.flip);
        Vitest.expect(failure).toBe(Slash.USAGE);
        Vitest.expect(
          yield* Effect.promise(() =>
            readFile(join(sandbox.workspace, '.agents', 'skills', 'alpha', 'SKILL.md'), 'utf8'),
          ),
        ).toBe(skillFile('alpha'));
      }),
    ),
  );

  Vitest.it.effect('--dir=value still works', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const { ui, messages } = recorder();
        yield* Slash.run(`list --dir=${sandbox.workspace}`, ui, sandbox.root);
        Vitest.expect(messages).toStrictEqual(['No skills.']);
      }),
    ),
  );

  Vitest.it.effect(
    'doctor --verbose runs the doctor instead of reporting usage',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const { ui, messages } = recorder();
          yield* Slash.run(`doctor --verbose --dir ${sandbox.workspace}`, ui, sandbox.workspace);
          Vitest.expect(messages).not.toStrictEqual([Slash.USAGE]);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(sandbox.workspace, '.agents', 'skills'))),
          ).toBe(true);
        }),
      ),
    30_000,
  );
});

Vitest.describe('relative paths resolve against the session directory', () => {
  Vitest.it.effect(
    'every store command treats --dir . as the session cwd, not the process cwd',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const session = join(sandbox.root, 'session');
          const host = join(sandbox.root, 'host');
          yield* Effect.promise(() =>
            Promise.all([mkdir(session, { recursive: true }), mkdir(host, { recursive: true })]),
          );
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(session, 'shared'),
              writeSkill(session, 'sessiononly'),
              writeSkill(session, 'gamma'),
              writeSkill(host, 'shared'),
              writeSkill(host, 'hostonly'),
            ]),
          );
          const sessionStore = join(session, '.agents', 'skills');
          const hostStore = join(host, '.agents', 'skills');
          const sessionSkill = (name: string): string => join(sessionStore, name, 'SKILL.md');
          const original = process.cwd();

          // Everything inside runs with the process launch directory at `host`
          // while the slash command's session directory is `session`.
          yield* Effect.gen(function* () {
            yield* Effect.sync(() => process.chdir(host));

            // list reads the session store.
            const listed = recorder();
            yield* Slash.run('list --dir .', listed.ui, session);
            Vitest.expect(listed.messages.join('\n')).toContain('sessiononly');
            Vitest.expect(listed.messages.join('\n')).toContain('shared');
            Vitest.expect(listed.messages.join('\n')).not.toContain('hostonly');

            // show reads the session store.
            const shown = recorder();
            yield* Slash.run('show sessiononly --dir .', shown.ui, session);
            Vitest.expect(shown.messages.join('\n')).toContain('sessiononly');

            // verify reads the session store.
            const verified = recorder();
            yield* Slash.run('verify --dir .', verified.ui, session);
            Vitest.expect(verified.messages.join('\n')).toContain('3 skills');

            // create writes the session store.
            yield* Slash.run('create fresh --description "new" --dir .', recorder().ui, session);
            Vitest.expect(
              yield* Effect.promise(() => pathExists(join(sessionStore, 'fresh'))),
            ).toBe(true);
            Vitest.expect(yield* Effect.promise(() => pathExists(join(hostStore, 'fresh')))).toBe(
              false,
            );

            // modify writes the session store.
            yield* Slash.run(
              'modify sessiononly --description "edited" --dir .',
              recorder().ui,
              session,
            );
            Vitest.expect(
              yield* Effect.promise(() => readFile(sessionSkill('sessiononly'), 'utf8')),
            ).toContain('edited');

            // delete removes from the session store, never the host store.
            yield* Slash.run('delete shared --dir .', recorder().ui, session);
            Vitest.expect(
              yield* Effect.promise(() => pathExists(join(sessionStore, 'shared'))),
            ).toBe(false);
            Vitest.expect(yield* Effect.promise(() => pathExists(join(hostStore, 'shared')))).toBe(
              true,
            );

            // sync reads the session checkout, not the host one.
            const synced = recorder();
            yield* Slash.run('sync --source . --target .', synced.ui, session);
            Vitest.expect(synced.messages.join('\n')).toContain('Unchanged');
            Vitest.expect(synced.messages.join('\n')).not.toContain('hostonly');
            Vitest.expect(
              yield* Effect.promise(() => pathExists(join(sessionStore, 'hostonly'))),
            ).toBe(false);
          }).pipe(
            // `process.chdir` is process-wide: always hand the original
            // directory back, even when an assertion above throws.
            Effect.ensuring(Effect.sync(() => process.chdir(original))),
          );
        }),
      ),
    30_000,
  );
});

Vitest.describe('effect/cli lexer parity', () => {
  Vitest.it.effect(
    'both front ends refuse a single-dash flag value and write nothing',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          for (const value of ['-x', '- bullet']) {
            const target = join(sandbox.workspace, '.agents', 'skills', 'alpha');
            const { ui, messages } = recorder();
            const failure = yield* Slash.run(
              `create alpha --description "${value}"`,
              ui,
              sandbox.workspace,
            ).pipe(Effect.flip);
            Vitest.expect(failure).toBe(Slash.USAGE);
            Vitest.expect(messages).toStrictEqual([]);
            Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(false);

            const binary = yield* Effect.sync(() =>
              runBinary(['create', 'alpha', '--description', value, '--dir', sandbox.workspace]),
            );
            Vitest.expect(binary.status).toBe(1);
            if (value === '-x') {
              Vitest.expect(binary.stdout).toContain('Missing value for flag --description');
            }
            Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(false);
          }
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'both front ends accept -- as the end of flags',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.workspace, 'alpha'));
          const target = join(sandbox.workspace, '.agents', 'skills', 'alpha');

          yield* Slash.run(
            `delete --dir ${sandbox.workspace} -- alpha`,
            recorder().ui,
            sandbox.workspace,
          );
          Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(false);

          yield* Effect.promise(() => writeSkill(sandbox.workspace, 'alpha'));
          const binary = yield* Effect.sync(() =>
            runBinary(['delete', '--dir', sandbox.workspace, '--', 'alpha']),
          );
          Vitest.expect(binary.status).toBe(0);
          Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(false);
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'both front ends accept an empty quoted description',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const slashWorkspace = join(sandbox.root, 'slash-empty');
          const binaryWorkspace = join(sandbox.root, 'binary-empty');
          yield* Effect.promise(() =>
            Promise.all([
              mkdir(slashWorkspace, { recursive: true }),
              mkdir(binaryWorkspace, { recursive: true }),
            ]),
          );

          yield* Slash.run('create alpha --description ""', recorder().ui, slashWorkspace);
          Vitest.expect(
            yield* Effect.promise(() =>
              pathExists(join(slashWorkspace, '.agents', 'skills', 'alpha', 'SKILL.md')),
            ),
          ).toBe(true);

          const binary = yield* Effect.sync(() =>
            runBinary(['create', 'alpha', '--description', '', '--dir', binaryWorkspace]),
          );
          Vitest.expect(binary.status).toBe(0);
          Vitest.expect(
            yield* Effect.promise(() =>
              pathExists(join(binaryWorkspace, '.agents', 'skills', 'alpha', 'SKILL.md')),
            ),
          ).toBe(true);
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'both front ends take the first value of a duplicated --dir',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const first = join(sandbox.root, 'first');
          const second = join(sandbox.root, 'second');
          yield* Effect.promise(() =>
            Promise.all([mkdir(first, { recursive: true }), mkdir(second, { recursive: true })]),
          );
          yield* Effect.promise(() =>
            Promise.all([writeSkill(first, 'alpha'), writeSkill(second, 'alpha')]),
          );

          yield* Slash.run(
            `delete alpha --dir ${first} --dir ${second}`,
            recorder().ui,
            sandbox.workspace,
          );
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(first, '.agents', 'skills', 'alpha'))),
          ).toBe(false);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(second, '.agents', 'skills', 'alpha'))),
          ).toBe(true);

          yield* Effect.promise(() => writeSkill(first, 'alpha'));
          const binary = yield* Effect.sync(() =>
            runBinary(['delete', 'alpha', '--dir', first, '--dir', second]),
          );
          Vitest.expect(binary.status).toBe(0);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(first, '.agents', 'skills', 'alpha'))),
          ).toBe(false);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(second, '.agents', 'skills', 'alpha'))),
          ).toBe(true);
        }),
      ),
    30_000,
  );
});

Vitest.describe('flag parity with the binary', () => {
  Vitest.it.effect(
    'both front ends refuse a bare --dir on delete',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.workspace, 'alpha'));
          const target = join(sandbox.workspace, '.agents', 'skills', 'alpha');

          const binary = yield* Effect.sync(() => runBinary(['delete', 'alpha', '--dir']));
          Vitest.expect(binary.status).toBe(1);
          Vitest.expect(binary.stdout).toContain('Missing value for flag --dir');

          const slash = yield* Slash.run(
            'delete alpha --dir',
            recorder().ui,
            sandbox.workspace,
          ).pipe(Effect.flip);
          Vitest.expect(slash).toBe(Slash.USAGE);
          Vitest.expect(yield* Effect.promise(() => pathExists(target))).toBe(true);
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'both front ends accept doctor --verbose',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const binaryWorkspace = join(sandbox.root, 'binary-workspace');
          const slashWorkspace = join(sandbox.root, 'slash-workspace');
          yield* Effect.promise(() =>
            Promise.all([
              mkdir(binaryWorkspace, { recursive: true }),
              mkdir(slashWorkspace, { recursive: true }),
            ]),
          );

          const binary = yield* Effect.sync(() =>
            runBinary(['doctor', '--verbose', `--dir=${binaryWorkspace}`]),
          );
          Vitest.expect(binary.status).toBe(0);
          Vitest.expect(binary.stdout).not.toContain('Unrecognized flag');

          yield* Slash.run(`doctor --verbose --dir ${slashWorkspace}`, recorder().ui, sandbox.root);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(slashWorkspace, '.agents', 'skills'))),
          ).toBe(true);
        }),
      ),
    30_000,
  );
});
