import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Sync from '../../sync/index.js';
import * as Renderers from '../renderers.apps.module.js';
import * as Slash from '../slash.apps.module.js';

/**
 * `sync` at the CLI boundary: the report each outcome renders, what a run
 * touches on disk, and the two front ends agreeing byte for byte.
 *
 * The engine's own behaviour lives in `../../sync/tests/sync.test.ts`; these
 * tests exist because two front ends can drift from one engine without either
 * unit test noticing — an exit code here, a missing line there.
 */

/** One temp area: the checkout to read and the workspace to write. */
interface Sandbox {
  readonly root: string;
  readonly checkout: string;
  readonly workspace: string;
}

/** A sandbox root's `.agents/skills` store. */
const store = (root: string): string => join(root, '.agents', 'skills');

/** Build a throwaway checkout + workspace pair and remove both afterwards. */
const withSandbox = <A, E>(use: (sandbox: Sandbox) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-skills-cli-sync-'));
      const checkout = join(root, 'checkout');
      const workspace = join(root, 'workspace');
      await mkdir(checkout, { recursive: true });
      await mkdir(workspace, { recursive: true });
      return { root, checkout, workspace };
    }),
    use,
    (sandbox) =>
      Effect.promise(() =>
        rm(sandbox.root, { recursive: true, force: true }).then(() => undefined),
      ),
  );

/** Write one fixture file, creating its parent directories. */
const write = (root: string, relative: string, contents: string | Uint8Array): Promise<void> => {
  const file = join(root, relative);
  return mkdir(dirname(file), { recursive: true }).then(() => writeFile(file, contents));
};

/** A minimal SKILL.md, with optional extra frontmatter lines. */
const skillFile = (name: string, extraFrontmatter = ''): string =>
  `---\nname: ${name}\ndescription: ${name} skill.\n${extraFrontmatter}---\n\n# When To Use\n\nBody.\n`;

/** Nested frontmatter that marks a skill internal. */
const INTERNAL = 'metadata:\n  internal: true\n';

/** Write a skill into a root's store, with optional extra files. */
const writeSkill = (
  root: string,
  name: string,
  options: {
    readonly internal?: boolean;
    readonly files?: Readonly<Record<string, string | Uint8Array>>;
  } = {},
): Promise<void> => {
  const base = `.agents/skills/${name}`;
  return write(root, `${base}/SKILL.md`, skillFile(name, options.internal === true ? INTERNAL : ''))
    .then(() =>
      Promise.all(
        Object.entries(options.files ?? {}).map(([file, contents]) =>
          write(root, `${base}/${file}`, contents),
        ),
      ),
    )
    .then(() => undefined);
};

/** One fixture file's text, or undefined when it is absent. */
const readAt = (root: string, relative: string): Promise<string | undefined> =>
  readFile(join(root, relative), 'utf8').then(
    (text) => text,
    () => undefined,
  );

/** True when a path exists. */
const pathExists = (target: string): Promise<boolean> =>
  stat(target).then(
    () => true,
    () => false,
  );

/** Every entry under a directory: base64 bytes per file, `<dir>` per directory. */
const contentsUnder = async (root: string): Promise<Record<string, string>> => {
  const entries = (await readdir(root, { recursive: true })).toSorted();
  const pairs = await Promise.all(
    entries.map(async (entry) => {
      const bytes = await readFile(join(root, entry)).catch(() => undefined);
      return [entry, bytes === undefined ? '<dir>' : bytes.toString('base64')] as const;
    }),
  );
  return Object.fromEntries(pairs);
};

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

/** One binary invocation's exit status and output. */
interface Spawned {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `src/apps/cli/main.ts` the way a user does: the real binary, real argv. */
const runBinary = (args: ReadonlyArray<string>, cwd = PACKAGE_ROOT): Spawned => {
  const main = resolve(PACKAGE_ROOT, 'src/apps/cli/main.ts');
  const result = spawnSync('bun', ['run', main, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

Vitest.describe('Renderers.sync', () => {
  Vitest.it.effect('groups skills by outcome, in order, and omits empty groups', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            writeSkill(sandbox.checkout, 'beta'),
            writeSkill(sandbox.checkout, 'gamma'),
            writeSkill(sandbox.checkout, 'secret', { internal: true }),
            write(
              sandbox.workspace,
              '.agents/skills/beta/SKILL.md',
              skillFile('beta', 'version: 0\n'),
            ),
            writeSkill(sandbox.workspace, 'gamma'),
          ]),
        );

        const result = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        Vitest.expect(result.skills.map((skill) => [skill.name, skill.outcome])).toStrictEqual([
          ['alpha', 'added'],
          ['beta', 'updated'],
          ['gamma', 'unchanged'],
          ['secret', 'skipped'],
        ]);

        Vitest.expect(Renderers.sync(result)).toBe(
          [
            `Synced ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
            'Created (1)',
            '  alpha',
            'Updated (1)',
            '  beta',
            'Unchanged (1)',
            '  gamma',
            'Skipped (1)',
            '  secret \u2014 internal',
            '',
            '1 created \u00b7 1 updated \u00b7 1 unchanged \u00b7 1 skipped',
          ].join('\n'),
        );
      }),
    ),
  );

  Vitest.it.effect('adds a file line per source file only under verbose', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha', {
              files: { 'CHANGELOG.md': '# new\n' },
            }),
            writeSkill(sandbox.checkout, 'secret', { internal: true }),
            write(sandbox.workspace, '.agents/skills/alpha/SKILL.md', skillFile('alpha')),
            write(sandbox.workspace, '.agents/skills/alpha/CHANGELOG.md', '# old\n'),
          ]),
        );

        const result = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        Vitest.expect(result.skills.map((skill) => skill.name)).toStrictEqual(['alpha', 'secret']);

        Vitest.expect(Renderers.sync(result).split('\n')).toStrictEqual([
          `Synced ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
          'Updated (1)',
          '  alpha',
          'Skipped (1)',
          '  secret \u2014 internal',
          '',
          '1 updated \u00b7 1 skipped',
        ]);
        Vitest.expect(Renderers.sync(result, { verbose: true })).toBe(
          [
            `Synced ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
            'Updated (1)',
            '  alpha',
            '    CHANGELOG.md: updated',
            '    SKILL.md: unchanged',
            'Skipped (1)',
            '  secret \u2014 internal',
            '',
            '1 updated \u00b7 1 skipped',
          ].join('\n'),
        );
      }),
    ),
  );
  Vitest.it.effect('renders a check verdict for current and drifted stores', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            writeSkill(sandbox.checkout, 'beta'),
          ]),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        const current = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
          check: true,
        });
        Vitest.expect(Renderers.sync(current)).toBe(
          [
            `Checked ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
            'Unchanged (2)',
            '  alpha \u2014 current',
            '  beta \u2014 current',
            '',
            '2 unchanged',
            '\u2713 current.',
          ].join('\n'),
        );

        yield* Effect.promise(() =>
          write(sandbox.workspace, '.agents/skills/alpha/SKILL.md', 'tampered\n'),
        );
        const drift = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
          check: true,
        });
        Vitest.expect(Renderers.sync(drift)).toBe(
          [
            `Checked ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
            'Updated (1)',
            '  alpha \u2014 diverged (SKILL.md; manifest @unknown)',
            'Unchanged (1)',
            '  beta \u2014 current',
            '',
            '1 updated \u00b7 1 unchanged',
            '\u2717 drift \u2014 1 skill would change.',
          ].join('\n'),
        );
      }),
    ),
  );
});

Vitest.describe('slash sync end to end', () => {
  Vitest.it.effect(
    'copies every public skill file and never the internal skill',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# changelog\n' } }),
              writeSkill(sandbox.checkout, 'secret', { internal: true }),
            ]),
          );
          const { ui, messages } = recorder();

          yield* Slash.run(
            `sync --source ${sandbox.checkout} --target ${sandbox.workspace}`,
            ui,
            sandbox.workspace,
          );

          Vitest.expect(messages).toStrictEqual([
            [
              `Synced ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
              'Created (1)',
              '  alpha',
              'Skipped (1)',
              '  secret \u2014 internal',
              '',
              '1 created \u00b7 1 skipped',
            ].join('\n'),
          ]);
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
          Vitest.expect(
            yield* Effect.promise(() =>
              readAt(sandbox.workspace, '.agents/skills/alpha/CHANGELOG.md'),
            ),
          ).toBe('# changelog\n');
          Vitest.expect(
            yield* Effect.promise(() =>
              readAt(sandbox.workspace, '.agents/skills/secret/SKILL.md'),
            ),
          ).toBeUndefined();
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'secret'))),
          ).toBe(false);
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'is idempotent: a second run reports unchanged and leaves the store byte-identical',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# changelog\n' } }),
          );
          const first = recorder();
          yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir ${sandbox.workspace}`,
            first.ui,
            sandbox.workspace,
          );
          const before = yield* Effect.promise(() => contentsUnder(store(sandbox.workspace)));

          const second = recorder();
          yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir ${sandbox.workspace}`,
            second.ui,
            sandbox.workspace,
          );

          Vitest.expect(second.messages).toStrictEqual([
            [
              `Synced ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
              'Unchanged (1)',
              '  alpha',
              '',
              '1 unchanged',
            ].join('\n'),
          ]);
          Vitest.expect(
            yield* Effect.promise(() => contentsUnder(store(sandbox.workspace))),
          ).toStrictEqual(before);
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'reports drift under --check and writes nothing back',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
          yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir ${sandbox.workspace}`,
            recorder().ui,
            sandbox.workspace,
          );
          const target = join(store(sandbox.workspace), 'alpha', 'SKILL.md');
          yield* Effect.promise(() => writeFile(target, 'tampered\n'));
          const before = yield* Effect.promise(() => readFile(target));

          const { ui, messages } = recorder();
          const failure = yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir ${sandbox.workspace} --check --verbose`,
            ui,
            sandbox.workspace,
          ).pipe(Effect.flip);

          Vitest.expect(messages).toStrictEqual([
            [
              `Checked ${sandbox.checkout} \u2192 ${sandbox.workspace}`,
              'Updated (1)',
              '  alpha \u2014 diverged (SKILL.md; manifest @unknown)',
              '    SKILL.md: updated',
              '',
              '1 updated',
              '\u2717 drift \u2014 1 skill would change.',
            ].join('\n'),
          ]);
          Vitest.expect(failure).toBe('Re-run without --check to apply: /mf-skills sync');
          Vitest.expect((yield* Effect.promise(() => readFile(target))).equals(before)).toBe(true);
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'resolves relative --from and --dir against the session cwd, not the process cwd',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
          const { ui, messages } = recorder();

          yield* Slash.run('sync --source checkout --target .', ui, sandbox.root);

          Vitest.expect(messages).toHaveLength(1);
          Vitest.expect(messages[0]).toContain('Created (1)');
          Vitest.expect(messages[0]).toContain('  alpha');
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.root, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'treats --from= and --dir= as absent and interprets booleans from their value',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));

          const emptyDir = recorder();
          yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir= --check=false --verbose=false`,
            emptyDir.ui,
            sandbox.workspace,
          );
          Vitest.expect(emptyDir.messages[0]).toContain('Created (1)');
          Vitest.expect(emptyDir.messages[0]).not.toContain('    SKILL.md:');
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));

          const emptyFrom = recorder();
          const drift = yield* Slash.run(
            'sync --from= --dir . --check',
            emptyFrom.ui,
            sandbox.workspace,
          ).pipe(Effect.flip);
          Vitest.expect(emptyFrom.messages[0]).toContain('✗ drift');
          Vitest.expect(emptyFrom.messages[0]).not.toContain('✓ current.');
          Vitest.expect(drift).toBe('Re-run without --check to apply: /mf-skills sync');
        }),
      ),
    20_000,
  );

  Vitest.it.effect('refuses an empty source store on the slash surface', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(store(sandbox.checkout), { recursive: true }));
        const failure = yield* Slash.run(
          `sync --from ${sandbox.checkout} --dir ${sandbox.workspace}`,
          recorder().ui,
          sandbox.workspace,
        ).pipe(Effect.flip);

        Vitest.expect(failure).toContain('no skill directories');
        Vitest.expect(failure).toContain('--source <checkout>');
      }),
    ),
  );

  Vitest.it.effect('refuses a source store whose directories hold no SKILL.md', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // The store exists and has a directory, so a name-count guard passes;
        // only the filtered outcomes can tell it holds no skill.
        yield* Effect.promise(() =>
          write(sandbox.checkout, '.agents/skills/notes/README.md', '# notes\n'),
        );
        const failure = yield* Slash.run(
          `sync --from ${sandbox.checkout} --dir ${sandbox.workspace} --check`,
          recorder().ui,
          sandbox.workspace,
        ).pipe(Effect.flip);

        Vitest.expect(failure).toContain('no skill directories');
        Vitest.expect(failure).toContain(store(sandbox.checkout));
        Vitest.expect(failure).toContain('--source <checkout>');
        Vitest.expect(failure).not.toContain('current');
      }),
    ),
  );
});

Vitest.describe('mf-skills sync binary', () => {
  Vitest.it.effect(
    'exits 0 on a clean run, 1 on --check drift, then 0 once current',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
          const args = ['sync', '--source', sandbox.checkout, '--target', sandbox.workspace];
          const target = join(store(sandbox.workspace), 'alpha', 'SKILL.md');

          const clean = yield* Effect.sync(() => runBinary(args));
          Vitest.expect(clean.status).toBe(0);
          Vitest.expect(clean.stdout).toContain('Created (1)');
          Vitest.expect(clean.stdout).toContain('  alpha');
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));

          yield* Effect.promise(() => writeFile(target, 'tampered\n'));
          const before = yield* Effect.promise(() => readFile(target));
          const drift = yield* Effect.sync(() => runBinary([...args, '--check', '--verbose']));
          Vitest.expect(drift.status).toBe(1);
          Vitest.expect(drift.stdout).toContain('Updated (1)');
          Vitest.expect(drift.stdout).toContain('    SKILL.md: updated');
          Vitest.expect(drift.stdout).toContain('✗ drift — 1 skill would change.');
          Vitest.expect(drift.stdout).toContain('Re-run without --check to apply: mf-skills sync');
          Vitest.expect((yield* Effect.promise(() => readFile(target))).equals(before)).toBe(true);

          const refused = yield* Effect.sync(() => runBinary(args));
          Vitest.expect(refused.status).toBe(1);
          Vitest.expect(refused.stdout).toContain('Refused (1)');
          Vitest.expect(refused.stdout).toContain('diverged');
          Vitest.expect((yield* Effect.sync(() => runBinary([...args, '--force']))).status).toBe(0);
          const current = yield* Effect.sync(() => runBinary([...args, '--check']));
          Vitest.expect(current.status).toBe(0);
          Vitest.expect(current.stdout).toContain('✓ current.');
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'refuses an unknown flag without running the command',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));

          const refused = yield* Effect.sync(() =>
            runBinary(['sync', '--from', sandbox.checkout, '--dir', sandbox.workspace, '--bogus']),
          );

          Vitest.expect(refused.status).not.toBe(0);
          Vitest.expect(`${refused.stdout}${refused.stderr}`).toContain(
            'Unrecognized flag: --bogus',
          );
          Vitest.expect(refused.stdout).not.toContain('Created (');
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'alpha'))),
          ).toBe(false);
        }),
      ),
    20_000,
  );

  Vitest.it.effect(
    'accepts --flag=value, including booleans, without a positional value',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
          const check = yield* Effect.sync(() =>
            runBinary([
              'sync',
              `--source=${sandbox.checkout}`,
              `--target=${sandbox.workspace}`,
              '--check=true',
              '--verbose=true',
            ]),
          );
          Vitest.expect(check.status).toBe(1);
          Vitest.expect(check.stdout).toContain('    SKILL.md: added');
          Vitest.expect(check.stdout).toContain('✗ drift');
          Vitest.expect(check.stdout).toContain('Re-run without --check to apply: mf-skills sync');

          const written = yield* Effect.sync(() =>
            runBinary([
              'sync',
              `--source=${sandbox.checkout}`,
              `--target=${sandbox.workspace}`,
              '--check=false',
              '--verbose=false',
            ]),
          );
          Vitest.expect(written.status).toBe(0);
          Vitest.expect(written.stdout).not.toContain('    SKILL.md:');
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'accepts --from and --dir as aliases of --source and --target',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));

          const aliased = yield* Effect.sync(() =>
            runBinary(['sync', '--from', sandbox.checkout, '--dir', sandbox.workspace]),
          );

          Vitest.expect(aliased.status).toBe(0);
          Vitest.expect(aliased.stdout).toContain('Created (1)');
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));

          // `--source=` is absent, so the alias still applies gap-for-gap with
          // the slash parser.
          const emptyCanonical = join(sandbox.root, 'empty-canonical-workspace');
          yield* Effect.promise(() => mkdir(emptyCanonical, { recursive: true }));
          const viaAlias = yield* Effect.sync(() =>
            runBinary([
              'sync',
              '--source=',
              '--from',
              sandbox.checkout,
              '--target=',
              '--dir',
              emptyCanonical,
            ]),
          );
          Vitest.expect(viaAlias.status).toBe(0);
          Vitest.expect(
            yield* Effect.promise(() => readAt(emptyCanonical, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'prefers the canonical --source and --target when an alias is also given',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const aliasCheckout = join(sandbox.root, 'alias-checkout');
          const aliasWorkspace = join(sandbox.root, 'alias-workspace');
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(sandbox.checkout, 'canonical'),
              writeSkill(aliasCheckout, 'aliased'),
              mkdir(aliasWorkspace, { recursive: true }),
            ]),
          );

          const result = yield* Effect.sync(() =>
            runBinary([
              'sync',
              '--source',
              sandbox.checkout,
              '--from',
              aliasCheckout,
              '--target',
              sandbox.workspace,
              '--dir',
              aliasWorkspace,
            ]),
          );

          Vitest.expect(result.status).toBe(0);
          Vitest.expect(result.stdout).toContain('  canonical');
          Vitest.expect(result.stdout).not.toContain('aliased');
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'canonical'))),
          ).toBe(true);
          Vitest.expect(
            yield* Effect.promise(() => pathExists(join(store(aliasWorkspace), 'aliased'))),
          ).toBe(false);
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'treats --from= as the default source and --dir= as the binary cwd',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));

          const explicitEmpty = yield* Effect.sync(() =>
            runBinary(['sync', '--from=', `--dir=${sandbox.workspace}`, '--check']),
          );
          Vitest.expect(explicitEmpty.status).toBe(1);
          Vitest.expect(explicitEmpty.stdout).toContain('✗ drift');
          Vitest.expect(explicitEmpty.stdout).not.toContain('no skills store');
          Vitest.expect(explicitEmpty.stdout).not.toContain('✓ current.');

          const omitted = yield* Effect.sync(() =>
            runBinary(['sync', `--dir=${sandbox.workspace}`, '--check']),
          );
          Vitest.expect(omitted.status).toBe(1);
          Vitest.expect(omitted.stdout).toContain('✗ drift');

          const dirEmpty = yield* Effect.sync(() =>
            runBinary(['sync', `--from=${sandbox.checkout}`, '--dir='], sandbox.workspace),
          );
          Vitest.expect(dirEmpty.status).toBe(0);
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
        }),
      ),
    30_000,
  );

  Vitest.it.effect('refuses an empty source store', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(store(sandbox.checkout), { recursive: true }));
        const refused = yield* Effect.sync(() =>
          runBinary(['sync', `--from=${sandbox.checkout}`, `--dir=${sandbox.workspace}`]),
        );

        Vitest.expect(refused.status).toBe(1);
        Vitest.expect(refused.stdout).toContain('no skill directories');
        Vitest.expect(refused.stdout).not.toContain('✓ current.');
      }),
    ),
  );

  Vitest.it.effect('refuses a source store whose directories hold no SKILL.md', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          write(sandbox.checkout, '.agents/skills/notes/README.md', '# notes\n'),
        );
        const refused = yield* Effect.sync(() =>
          runBinary([
            'sync',
            `--from=${sandbox.checkout}`,
            `--dir=${sandbox.workspace}`,
            '--check',
          ]),
        );

        Vitest.expect(refused.status).toBe(1);
        Vitest.expect(refused.stdout).toContain('no skill directories');
        Vitest.expect(refused.stdout).not.toContain('✓ current.');
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(sandbox.workspace, '.agents'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('refuses an uppercase boolean value exactly as the slash does', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
        const args = ['sync', `--from=${sandbox.checkout}`, `--dir=${sandbox.workspace}`];

        const binary = yield* Effect.sync(() => runBinary([...args, '--check=FALSE']));
        Vitest.expect(binary.status).toBe(1);
        Vitest.expect(`${binary.stdout}${binary.stderr}`).toContain(
          'Invalid value for flag --check',
        );

        const slash = yield* Slash.run(
          `sync --from ${sandbox.checkout} --dir ${sandbox.workspace} --check=FALSE`,
          recorder().ui,
          sandbox.workspace,
        ).pipe(Effect.flip);
        Vitest.expect(slash).toBe(Slash.USAGE);
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'alpha'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect(
    'refuses a path flag with no value exactly as the slash does',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          const flags = ['--source', '--target', '--from', '--dir'];
          for (const flag of flags) {
            const binary = yield* Effect.sync(() => runBinary(['sync', flag]));
            Vitest.expect(binary.status).toBe(1);
            Vitest.expect(`${binary.stdout}${binary.stderr}`).toContain(
              `Missing value for flag ${flag}`,
            );

            const { ui, messages } = recorder();
            const slash = yield* Slash.run(`sync ${flag}`, ui, sandbox.workspace).pipe(Effect.flip);
            Vitest.expect(slash).toBe(Slash.USAGE);
            Vitest.expect(messages).toStrictEqual([]);
            Vitest.expect(
              yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'alpha'))),
            ).toBe(false);
          }
        }),
      ),
    30_000,
  );
});

Vitest.describe('sync front-end parity', () => {
  Vitest.it.effect(
    'the binary and the slash command print the same report for the same store',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# one\n' } }),
              writeSkill(sandbox.checkout, 'secret', { internal: true }),
            ]),
          );
          const args = ['sync', '--from', sandbox.checkout, '--dir', sandbox.workspace];
          Vitest.expect((yield* Effect.sync(() => runBinary(args))).status).toBe(0);

          const binary = yield* Effect.sync(() => runBinary([...args, '--check', '--verbose']));
          Vitest.expect(binary.status).toBe(0);

          const { ui, messages } = recorder();
          yield* Slash.run(
            `sync --from ${sandbox.checkout} --dir ${sandbox.workspace} --check --verbose`,
            ui,
            sandbox.workspace,
          );

          Vitest.expect(messages).toHaveLength(1);
          Vitest.expect(messages[0]?.trimEnd()).toBe(binary.stdout.trimEnd());
          Vitest.expect(binary.stdout).toContain('Unchanged (1)');
          Vitest.expect(binary.stdout).toContain('    CHANGELOG.md: unchanged');
        }),
      ),
    30_000,
  );

  Vitest.it.effect(
    'the binary and the slash command agree on boolean values and their reports',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
          const checkedWorkspace = join(sandbox.root, 'checked-workspace');
          const binaryWorkspace = join(sandbox.root, 'binary-workspace');
          const slashWorkspace = join(sandbox.root, 'slash-workspace');
          yield* Effect.promise(() =>
            Promise.all([
              mkdir(checkedWorkspace, { recursive: true }),
              mkdir(binaryWorkspace, { recursive: true }),
              mkdir(slashWorkspace, { recursive: true }),
            ]),
          );

          // Same store, same flags, both report-only: the report bytes match.
          const binaryCheck = yield* Effect.sync(() =>
            runBinary([
              'sync',
              `--source=${sandbox.checkout}`,
              `--target=${checkedWorkspace}`,
              '--check=true',
              '--verbose=false',
            ]),
          );
          Vitest.expect(binaryCheck.status).toBe(1);
          Vitest.expect(binaryCheck.stdout).not.toContain('    SKILL.md:');

          const { ui, messages } = recorder();
          yield* Slash.run(
            `sync --source=${sandbox.checkout} --target=${checkedWorkspace} --check=true --verbose=false`,
            ui,
            checkedWorkspace,
          ).pipe(Effect.flip);

          Vitest.expect(messages).toHaveLength(1);
          Vitest.expect(binaryCheck.stdout.trimEnd().startsWith(messages[0]?.trimEnd() ?? '')).toBe(
            true,
          );
          Vitest.expect(messages[0]).not.toContain('    SKILL.md:');

          // `--check=false` writes on both surfaces.
          const binary = yield* Effect.sync(() =>
            runBinary([
              'sync',
              `--source=${sandbox.checkout}`,
              `--target=${binaryWorkspace}`,
              '--check=false',
              '--verbose=false',
            ]),
          );
          Vitest.expect(binary.status).toBe(0);
          Vitest.expect(binary.stdout).not.toContain('    SKILL.md:');

          yield* Slash.run(
            `sync --from=${sandbox.checkout} --dir=${slashWorkspace} --check=false --verbose=false`,
            recorder().ui,
            slashWorkspace,
          );

          Vitest.expect(
            yield* Effect.promise(() => readAt(binaryWorkspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
          Vitest.expect(
            yield* Effect.promise(() => readAt(slashWorkspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
        }),
      ),
    30_000,
  );

  Vitest.it('parses all four flags in --flag value form', () => {
    Vitest.expect(
      Slash.parseCliArgs('sync --source /tmp/checkout --target /tmp/work --check --verbose'),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/tmp/checkout',
      target: '/tmp/work',
      check: true,
      force: false,
      verbose: true,
    });
  });

  Vitest.it('parses all four flags in --flag=value form', () => {
    Vitest.expect(
      Slash.parseCliArgs(
        'sync --source=/tmp/checkout --target=/tmp/work --check=true --verbose=true',
      ),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/tmp/checkout',
      target: '/tmp/work',
      check: true,
      force: false,
      verbose: true,
    });
  });

  Vitest.it('folds --from and --dir into source and target', () => {
    Vitest.expect(
      Slash.parseCliArgs('sync --from /tmp/checkout --dir /tmp/work --check --verbose'),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/tmp/checkout',
      target: '/tmp/work',
      check: true,
      force: false,
      verbose: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --from=/tmp/checkout --dir=/tmp/work')).toStrictEqual({
      kind: 'Sync',
      source: '/tmp/checkout',
      target: '/tmp/work',
      check: false,
      force: false,
      verbose: false,
    });
  });

  Vitest.it('prefers the canonical name when an alias is also given', () => {
    Vitest.expect(
      Slash.parseCliArgs(
        'sync --source /canonical-source --from /alias-source --target /canonical-target --dir /alias-target',
      ),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/canonical-source',
      target: '/canonical-target',
      check: false,
      force: false,
      verbose: false,
    });
    // Reversed order: source/target still win over the aliases.
    Vitest.expect(
      Slash.parseCliArgs(
        'sync --from /alias-source --source=/canonical-source --dir=/alias-target --target=/canonical-target',
      ),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/canonical-source',
      target: '/canonical-target',
      check: false,
      force: false,
      verbose: false,
    });
    // An empty canonical flag is absent, so the alias still applies.
    Vitest.expect(
      Slash.parseCliArgs('sync --source= --from /alias-source --target= --dir /alias-target'),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/alias-source',
      target: '/alias-target',
      check: false,
      force: false,
      verbose: false,
    });
  });

  Vitest.it('parses false booleans in both value forms', () => {
    Vitest.expect(
      Slash.parseCliArgs(
        'sync --source=/tmp/checkout --target=/tmp/work --check=false --verbose=false',
      ),
    ).toStrictEqual({
      kind: 'Sync',
      source: '/tmp/checkout',
      target: '/tmp/work',
      check: false,
      force: false,
      verbose: false,
    });
    Vitest.expect(Slash.parseCliArgs('sync --check false --verbose true')).toStrictEqual({
      kind: 'Sync',
      source: undefined,
      target: undefined,
      check: false,
      force: false,
      verbose: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --check true')).toStrictEqual({
      kind: 'Sync',
      source: undefined,
      target: undefined,
      check: true,
      force: false,
      verbose: false,
    });
  });

  Vitest.it('marks a malformed sync invocation invalid rather than plain help', () => {
    Vitest.expect(Slash.parseCliArgs('sync --check=bogus')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --check=')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    // `effect/cli` matches boolean spellings exactly; uppercase is not `false`.
    Vitest.expect(Slash.parseCliArgs('sync --check=FALSE')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --check=TRUE')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --check=false')).toStrictEqual({
      kind: 'Sync',
      source: undefined,
      target: undefined,
      check: false,
      force: false,
      verbose: false,
    });
    // A path flag with no value is `Missing value for flag` on the binary.
    Vitest.expect(Slash.parseCliArgs('sync --source')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --target')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --from')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
    Vitest.expect(Slash.parseCliArgs('sync --source /tmp/checkout --dir')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
  });

  Vitest.it('falls back to help on an unknown flag', () => {
    Vitest.expect(Slash.parseCliArgs('sync --from /tmp/checkout --bogus x')).toStrictEqual({
      kind: 'Help',
      invalid: true,
    });
  });

  Vitest.it.effect('fails a malformed sync invocation instead of reporting success', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
        const { ui, messages } = recorder();

        const failure = yield* Slash.run(
          // Uppercase false would write on a lowercasing parser; the binary
          // refuses it, so the slash must refuse too.
          `sync --from ${sandbox.checkout} --dir ${sandbox.workspace} --check=FALSE`,
          ui,
          sandbox.workspace,
        ).pipe(Effect.flip);

        Vitest.expect(failure).toBe(Slash.USAGE);
        Vitest.expect(messages).toStrictEqual([]);
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'alpha'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('keeps plain help successful for the caller who asked for it', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        for (const args of ['', 'wat', 'help']) {
          const { ui, messages } = recorder();
          yield* Slash.run(args, ui, sandbox.workspace);
          Vitest.expect(messages).toStrictEqual([Slash.USAGE]);
        }
      }),
    ),
  );
});
