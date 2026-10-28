import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Sync from '../index.js';

/** One temp area: the checkout to read and the workspace to write. */
interface Sandbox {
  readonly root: string;
  readonly checkout: string;
  readonly workspace: string;
}

/** Build a throwaway checkout + workspace pair and remove both afterwards. */
const withSandbox = <A, E>(use: (sandbox: Sandbox) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await mkdtemp(join(tmpdir(), 'mf-skills-sync-'));
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

/** A sandbox root's `.agents/skills` store. */
const store = (root: string): string => join(root, '.agents', 'skills');

/** A minimal SKILL.md body, with optional extra frontmatter lines. */
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

/** This checkout, which the package-relative default source names. */
const REPO_ROOT = resolvePath(import.meta.dirname, '..', '..', '..', '..', '..', '..');

/** Staged temps and rename backups a run should never leave behind. */
const leftoversIn = (dir: string): Promise<ReadonlyArray<string>> =>
  readdir(dir).then((entries) =>
    entries.filter((entry) => entry.includes('.tmp') || entry.includes('.bak')),
  );

/** Frontmatter spellings that do or do not mean `metadata.internal: true`. */
const INTERNAL_CASES: ReadonlyArray<readonly [string, string, boolean]> = [
  ['block mapping', 'metadata:\n  internal: true\n', true],
  ['flow mapping', 'metadata: {internal: true}\n', true],
  ['flow mapping with spaces', 'metadata: { internal: true }\n', true],
  ['quoted and padded scalar', 'metadata:\n  internal: " true "\n', true],
  ['single-quoted scalar', "metadata:\n  internal: 'true'\n", true],
  ['uppercase scalar', 'metadata:\n  internal: TRUE\n', true],
  ['top-level internal key', 'internal: true\n', false],
  ['nested internal under another parent', 'review:\n  internal: true\n', false],
  ['deeper nested internal', 'metadata:\n  labels:\n    internal: true\n', false],
  ['explicit false', 'metadata:\n  internal: false\n', false],
  ['flow mapping false', 'metadata: {internal: false}\n', false],
];

Vitest.describe('Sync.isInternalSkill', () => {
  for (const [label, frontmatter, expected] of INTERNAL_CASES) {
    Vitest.it(`reads ${label} as ${expected ? 'internal' : 'public'}`, () => {
      Vitest.expect(Sync.isInternalSkill(skillFile('probe', frontmatter))).toBe(expected);
    });
  }

  Vitest.it('treats absent metadata and missing frontmatter as public', () => {
    Vitest.expect(Sync.isInternalSkill(skillFile('open'))).toBe(false);
    Vitest.expect(Sync.isInternalSkill('# no frontmatter here\n')).toBe(false);
  });
});

Vitest.describe('Sync.resolveDefaultSource', () => {
  Vitest.it.effect('uses the package checkout when it is a checkout', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const packageCheckout = join(sandbox.root, 'package');
        const cwdCheckout = join(sandbox.root, 'cwd-checkout');
        yield* Effect.promise(() =>
          Promise.all([
            mkdir(join(packageCheckout, '.agents', 'skills'), { recursive: true }),
            mkdir(join(cwdCheckout, '.agents', 'skills'), { recursive: true }),
            write(cwdCheckout, 'packages/skills/package.json', '{}\n'),
          ]),
        );

        const resolved = yield* Sync.resolveDefaultSource({ packageCheckout, cwd: cwdCheckout });
        Vitest.expect(resolved).toBe(packageCheckout);
      }),
    ),
  );

  Vitest.it.effect('falls back to a montflow checkout at cwd', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const packageCheckout = join(sandbox.root, 'package');
        const cwdCheckout = join(sandbox.root, 'cwd-checkout');
        yield* Effect.promise(() =>
          Promise.all([
            mkdir(join(packageCheckout, '.agents', 'skills'), { recursive: true }),
            mkdir(join(cwdCheckout, '.agents', 'skills'), { recursive: true }),
            write(cwdCheckout, 'packages/skills/package.json', '{}\n'),
          ]),
        );
        // Simulate a compiled binary: the package-relative path is not a checkout.
        yield* Effect.promise(() => rm(join(packageCheckout, '.agents'), { recursive: true }));

        const resolved = yield* Sync.resolveDefaultSource({ packageCheckout, cwd: cwdCheckout });
        Vitest.expect(resolved).toBe(cwdCheckout);
      }),
    ),
  );

  Vitest.it.effect('refuses when neither candidate is a checkout', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const packageCheckout = join(sandbox.root, 'package');
        const cwdStore = join(sandbox.root, 'merely-a-workspace');
        yield* Effect.promise(() =>
          Promise.all([
            mkdir(packageCheckout, { recursive: true }),
            mkdir(join(cwdStore, '.agents', 'skills'), { recursive: true }),
          ]),
        );

        const refusal = yield* Sync.resolveDefaultSource({
          packageCheckout,
          cwd: cwdStore,
        }).pipe(Effect.flip);

        Vitest.expect(refusal).toContain('--source <checkout>');
        Vitest.expect(refusal).toContain(packageCheckout);
        Vitest.expect(refusal).toContain(cwdStore);
      }),
    ),
  );
});

Vitest.describe('Sync.runSync', () => {
  Vitest.it.effect(
    'copies public skills, reports internal ones as skipped, and ignores non-skills',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# changelog\n' } }),
              writeSkill(sandbox.checkout, 'secret', { internal: true }),
              write(sandbox.checkout, '.agents/skills/notes/README.md', 'not a skill\n'),
            ]),
          );
          const result = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

          Vitest.expect(result.source).toBe(store(sandbox.checkout));
          Vitest.expect(result.target).toBe(store(sandbox.workspace));
          Vitest.expect(result.sourceRoot).toBe(sandbox.checkout);
          Vitest.expect(result.targetRoot).toBe(sandbox.workspace);
          Vitest.expect(result.check).toBe(false);
          Vitest.expect(result.skills.map((skill) => [skill.name, skill.outcome])).toStrictEqual([
            ['alpha', 'added'],
            ['secret', 'skipped'],
          ]);
          Vitest.expect(result.skills.find((skill) => skill.name === 'secret')?.reason).toBe(
            'internal',
          );
          Vitest.expect(result.changed).toStrictEqual(['alpha']);
          Vitest.expect(result.drifted).toBe(true);
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
        }),
      ),
  );

  Vitest.it.effect('is idempotent and reports each skill unchanged on a second run', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        const second = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(second.skills.map((skill) => skill.outcome)).toStrictEqual(['unchanged']);
        Vitest.expect(second.skills[0]?.files).toStrictEqual([
          { file: 'SKILL.md', outcome: 'unchanged' },
        ]);
        Vitest.expect(second.drifted).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('overwrites only the files whose bytes differ', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', {
            files: { 'CHANGELOG.md': '# one\n', 'GATES.md': '# gates\n' },
          }),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        yield* Effect.promise(() =>
          Promise.all([
            write(
              sandbox.checkout,
              '.agents/skills/alpha/SKILL.md',
              skillFile('alpha', 'version: 2.0.0\n'),
            ),
            write(sandbox.checkout, '.agents/skills/alpha/CHANGELOG.md', '# two\n'),
          ]),
        );
        const updated = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(updated.skills[0]?.outcome).toBe('updated');
        Vitest.expect(updated.skills[0]?.files).toStrictEqual([
          { file: 'CHANGELOG.md', outcome: 'updated' },
          { file: 'GATES.md', outcome: 'unchanged' },
          { file: 'SKILL.md', outcome: 'updated' },
        ]);
        Vitest.expect(updated.changed).toStrictEqual(['alpha']);
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/alpha/CHANGELOG.md'),
          ),
        ).toBe('# two\n');
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/GATES.md')),
        ).toBe('# gates\n');
      }),
    ),
  );

  Vitest.it.effect('runs report-only: computes drift and writes nothing', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
        const checked = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
          check: true,
        });

        Vitest.expect(checked.check).toBe(true);
        Vitest.expect(checked.skills.map((skill) => skill.outcome)).toStrictEqual(['added']);
        Vitest.expect(checked.drifted).toBe(true);
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBeUndefined();
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(sandbox.workspace, '.agents'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('reports no drift once the target matches the source', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', { files: { 'GATES.md': '# g\n' } }),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        const checked = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
          check: true,
        });

        Vitest.expect(checked.drifted).toBe(false);
        Vitest.expect(checked.skills.map((skill) => skill.outcome)).toStrictEqual(['unchanged']);
      }),
    ),
  );

  Vitest.it.effect('leaves extra target skills and extra target files untouched', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# new\n' } }),
            writeSkill(sandbox.workspace, 'legacy'),
            write(sandbox.workspace, '.agents/skills/alpha/local.md', 'keep me\n'),
          ]),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/legacy/SKILL.md')),
        ).toBe(skillFile('legacy'));
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/local.md')),
        ).toBe('keep me\n');
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/alpha/CHANGELOG.md'),
          ),
        ).toBe('# new\n');
      }),
    ),
  );

  Vitest.it.effect('copies nested files and binary bytes verbatim', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const bytes = Uint8Array.from([0, 255, 1, 2, 0, 10, 13]);
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'assets', {
            files: { 'docs/guide.md': '# guide\n', 'media/logo.bin': bytes },
          }),
        );
        const result = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(result.skills[0]?.files.map((file) => file.file)).toStrictEqual([
          'SKILL.md',
          'docs/guide.md',
          'media/logo.bin',
        ]);
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/assets/docs/guide.md'),
          ),
        ).toBe('# guide\n');
        const copied = yield* Effect.promise(() =>
          readFile(join(sandbox.workspace, '.agents/skills/assets/media/logo.bin')),
        );
        Vitest.expect(new Uint8Array(copied)).toStrictEqual(bytes);
      }),
    ),
  );

  Vitest.it.effect('resolves the package checkout when --source is omitted', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const result = yield* Sync.runSync({
          dir: sandbox.workspace,
          check: true,
        });

        Vitest.expect(result.source).toBe(store(REPO_ROOT));
        Vitest.expect(result.skills.length).toBeGreaterThan(0);
      }),
    ),
  );

  Vitest.it.effect('treats an empty --source and an empty --target as absent', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const fromEmpty = yield* Sync.runSync({
          from: '',
          dir: sandbox.workspace,
          cwd: sandbox.checkout,
          check: true,
        });
        const fromOmitted = yield* Sync.runSync({
          dir: sandbox.workspace,
          cwd: sandbox.checkout,
          check: true,
        });

        Vitest.expect(fromEmpty.source).toBe(fromOmitted.source);
        Vitest.expect(fromEmpty.source).toBe(store(REPO_ROOT));

        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'alpha'));
        const dirEmpty = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: '',
          cwd: sandbox.workspace,
        });
        Vitest.expect(dirEmpty.target).toBe(store(sandbox.workspace));
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBe(skillFile('alpha'));
      }),
    ),
  );

  Vitest.it.effect('refuses a target skill symlinked outside the store', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const outside = join(sandbox.root, 'outside');
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            write(outside, 'SKILL.md', 'LOCAL MINE\n'),
            mkdir(store(sandbox.workspace), { recursive: true }),
          ]),
        );
        yield* Effect.promise(() => symlink(outside, join(store(sandbox.workspace), 'alpha')));

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);

        Vitest.expect(refusal).toContain('refusing to write');
        Vitest.expect(refusal).toContain(join(store(sandbox.workspace), 'alpha'));
        Vitest.expect(refusal).toContain(store(sandbox.workspace));
        Vitest.expect(yield* Effect.promise(() => readAt(outside, 'SKILL.md'))).toBe(
          'LOCAL MINE\n',
        );
      }),
    ),
  );

  Vitest.it.effect('refuses a target file symlinked outside the store', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const outside = join(sandbox.root, 'outside.md');
        const linked = join(store(sandbox.workspace), 'alpha', 'SKILL.md');
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            writeSkill(sandbox.workspace, 'alpha'),
            write(sandbox.root, 'outside.md', 'LOCAL MINE\n'),
          ]),
        );
        yield* Effect.promise(() => rm(linked, { force: true }));
        yield* Effect.promise(() => symlink(outside, linked));

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);

        Vitest.expect(refusal).toContain('refusing to write');
        Vitest.expect(refusal).toContain(linked);
        Vitest.expect(yield* Effect.promise(() => readAt(sandbox.root, 'outside.md'))).toBe(
          'LOCAL MINE\n',
        );
      }),
    ),
  );

  Vitest.it.effect('allows a symlinked store, using its real path as the root', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const realStore = join(sandbox.root, 'real-store');
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            mkdir(realStore, { recursive: true }),
            mkdir(join(sandbox.workspace, '.agents'), { recursive: true }),
          ]),
        );
        yield* Effect.promise(() => symlink(realStore, store(sandbox.workspace), 'dir'));

        const result = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        });

        Vitest.expect(result.skills[0]?.outcome).toBe('added');
        Vitest.expect(yield* Effect.promise(() => readAt(realStore, 'alpha/SKILL.md'))).toBe(
          skillFile('alpha'),
        );
      }),
    ),
  );

  Vitest.it.effect('refuses a source store with no skill directories', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => mkdir(store(sandbox.checkout), { recursive: true }));

        const empty = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);
        Vitest.expect(empty).toContain('no skill directories');
        Vitest.expect(empty).toContain(store(sandbox.checkout));
        Vitest.expect(empty).toContain('--source <checkout>');

        yield* Effect.promise(() =>
          write(sandbox.checkout, '.agents/skills/README.md', 'not a skill\n'),
        );
        const filesOnly = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);
        Vitest.expect(filesOnly).toContain('no skill directories');
      }),
    ),
  );

  Vitest.it.effect('refuses a source store holding only directories that are not skills', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // A directory without a SKILL.md is not a skill, so a store full of
        // notes still has nothing to verify and must not report `current`.
        yield* Effect.promise(() =>
          write(sandbox.checkout, '.agents/skills/notes/README.md', '# notes\n'),
        );

        for (const check of [false, true]) {
          const refusal = yield* Sync.runSync({
            from: sandbox.checkout,
            dir: sandbox.workspace,
            check,
          }).pipe(Effect.flip);
          Vitest.expect(refusal).toContain('no skill directories');
          Vitest.expect(refusal).toContain(store(sandbox.checkout));
          Vitest.expect(refusal).toContain('--source <checkout>');
        }
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(sandbox.workspace, '.agents'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('accepts a source store whose only skills are internal', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // Skipped entries are outcomes, not an empty store: internal-only is a
        // real store that installs nothing.
        yield* Effect.promise(() => writeSkill(sandbox.checkout, 'secret', { internal: true }));
        const result = yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(result.skills.map((skill) => [skill.name, skill.outcome])).toStrictEqual([
          ['secret', 'skipped'],
        ]);
        Vitest.expect(result.changed).toStrictEqual([]);
        Vitest.expect(result.drifted).toBe(false);
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'secret'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('writes through sibling temps and leaves none behind', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# one\n' } }),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        Vitest.expect(
          yield* Effect.promise(() => leftoversIn(join(store(sandbox.workspace), 'alpha'))),
        ).toStrictEqual([]);
        Vitest.expect(
          yield* Effect.promise(() => readdir(join(store(sandbox.workspace), 'alpha'))),
        ).toStrictEqual(['CHANGELOG.md', 'SKILL.md']);
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBe(skillFile('alpha'));
      }),
    ),
  );

  Vitest.it.effect('fails cleanly when the target directory is read-only', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // Root ignores directory permissions, so the check would be vacuous.
        if (process.getuid?.() === 0) return;
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', { files: { 'CHANGELOG.md': '# one\n' } }),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });

        const target = join(store(sandbox.workspace), 'alpha');
        yield* Effect.promise(() =>
          write(sandbox.checkout, '.agents/skills/alpha/CHANGELOG.md', '# two\n'),
        );
        yield* Effect.promise(() => chmod(target, 0o555));

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip, Effect.ensuring(Effect.promise(() => chmod(target, 0o755))));

        Vitest.expect(refusal).toContain('cannot write');
        Vitest.expect(yield* Effect.promise(() => leftoversIn(target))).toStrictEqual([]);
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBe(skillFile('alpha'));
      }),
    ),
  );

  Vitest.it.effect(
    'refuses a nested directory symlinked outside the store when the destination is absent',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          // `alpha/docs` exists and is a link; `alpha/docs/guide.md` does not
          // exist anywhere. Resolving only the leaf would miss the link.
          const outside = join(sandbox.root, 'outside');
          const linked = join(store(sandbox.workspace), 'alpha', 'docs');
          yield* Effect.promise(() =>
            Promise.all([
              writeSkill(sandbox.checkout, 'alpha', { files: { 'docs/guide.md': '# guide\n' } }),
              writeSkill(sandbox.workspace, 'alpha'),
              mkdir(outside, { recursive: true }),
            ]),
          );
          yield* Effect.promise(() => symlink(outside, linked));

          const refusal = yield* Sync.runSync({
            from: sandbox.checkout,
            dir: sandbox.workspace,
          }).pipe(Effect.flip);

          Vitest.expect(refusal).toContain('refusing to write');
          Vitest.expect(refusal).toContain(
            join(store(sandbox.workspace), 'alpha', 'docs', 'guide.md'),
          );
          Vitest.expect(refusal).toContain(store(sandbox.workspace));
          Vitest.expect(yield* Effect.promise(() => readdir(outside))).toStrictEqual([]);
          Vitest.expect(
            yield* Effect.promise(() =>
              pathExists(join(store(sandbox.workspace), 'alpha', 'docs', 'guide.md')),
            ),
          ).toBe(false);
          Vitest.expect(
            yield* Effect.promise(() => leftoversIn(join(store(sandbox.workspace), 'alpha'))),
          ).toStrictEqual([]);
        }),
      ),
  );

  Vitest.it.effect(
    'stages every changed file before renaming, so a failed stage leaves the skill untouched',
    () =>
      withSandbox((sandbox) =>
        Effect.gen(function* () {
          // Root ignores directory permissions, so the check would be vacuous.
          if (process.getuid?.() === 0) return;
          yield* Effect.promise(() =>
            writeSkill(sandbox.checkout, 'alpha', { files: { 'docs/guide.md': '# v1\n' } }),
          );
          yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
          yield* Effect.promise(() =>
            Promise.all([
              write(
                sandbox.checkout,
                '.agents/skills/alpha/SKILL.md',
                skillFile('alpha', 'version: 2.0.0\n'),
              ),
              write(sandbox.checkout, '.agents/skills/alpha/docs/guide.md', '# v2\n'),
            ]),
          );
          const target = join(store(sandbox.workspace), 'alpha');
          const docs = join(target, 'docs');
          yield* Effect.promise(() => chmod(docs, 0o555));

          const refusal = yield* Sync.runSync({
            from: sandbox.checkout,
            dir: sandbox.workspace,
          }).pipe(Effect.flip, Effect.ensuring(Effect.promise(() => chmod(docs, 0o755))));

          Vitest.expect(refusal).toContain('cannot write');
          // SKILL.md stages first; the docs failure must discard it rather
          // than leave the skill half-updated.
          Vitest.expect(
            yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
          ).toBe(skillFile('alpha'));
          Vitest.expect(
            yield* Effect.promise(() =>
              readAt(sandbox.workspace, '.agents/skills/alpha/docs/guide.md'),
            ),
          ).toBe('# v1\n');
          Vitest.expect(yield* Effect.promise(() => leftoversIn(target))).toStrictEqual([]);
          Vitest.expect(yield* Effect.promise(() => leftoversIn(docs))).toStrictEqual([]);
        }),
      ),
  );

  Vitest.it.effect('names the skills already applied when a later skill fails', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // Root ignores directory permissions, so the check would be vacuous.
        if (process.getuid?.() === 0) return;
        yield* Effect.promise(() =>
          Promise.all([
            writeSkill(sandbox.checkout, 'alpha'),
            writeSkill(sandbox.checkout, 'beta'),
            writeSkill(sandbox.checkout, 'gamma', { files: { 'CHANGELOG.md': '# two\n' } }),
            write(sandbox.workspace, '.agents/skills/gamma/SKILL.md', skillFile('gamma')),
            write(sandbox.workspace, '.agents/skills/gamma/CHANGELOG.md', '# one\n'),
          ]),
        );
        const target = join(store(sandbox.workspace), 'gamma');
        yield* Effect.promise(() => chmod(target, 0o555));

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip, Effect.ensuring(Effect.promise(() => chmod(target, 0o755))));

        Vitest.expect(refusal).toContain('cannot write');
        Vitest.expect(refusal).toContain('already applied: alpha (added), beta (added)');
        Vitest.expect(refusal).toContain('failed: gamma');
        // The failing skill is untouched even though earlier skills landed.
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/gamma/CHANGELOG.md'),
          ),
        ).toBe('# one\n');
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBe(skillFile('alpha'));
      }),
    ),
  );

  Vitest.it.effect('rolls back the files already renamed when a later rename fails', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', {
            files: { 'CHANGELOG.md': '# one\n', 'docs/guide.md': '# v1\n' },
          }),
        );
        yield* Sync.runSync({ from: sandbox.checkout, dir: sandbox.workspace });
        yield* Effect.promise(() =>
          Promise.all([
            write(
              sandbox.checkout,
              '.agents/skills/alpha/SKILL.md',
              skillFile('alpha', 'version: 2.0.0\n'),
            ),
            write(sandbox.checkout, '.agents/skills/alpha/CHANGELOG.md', '# two\n'),
            write(sandbox.checkout, '.agents/skills/alpha/docs/guide.md', '# v2\n'),
          ]),
        );
        // A pre-existing directory at a destination makes the last rename
        // fail after `SKILL.md` and `CHANGELOG.md` have already been renamed
        // into place.
        const target = join(store(sandbox.workspace), 'alpha');
        const guide = join(target, 'docs', 'guide.md');
        yield* Effect.promise(async () => {
          await rm(guide);
          await mkdir(guide, { recursive: true });
        });

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);

        Vitest.expect(refusal).toContain('cannot write');
        Vitest.expect(refusal).toContain('failed: alpha');
        // Backups are copies, so the destinations that existed before the run
        // are never missing: after rollback every one of them is present with
        // its old bytes. The early renames must be undone, not left at the new
        // bytes.
        const skill = join(target, 'SKILL.md');
        Vitest.expect(yield* Effect.promise(() => pathExists(skill))).toBe(true);
        Vitest.expect(
          yield* Effect.promise(() => readAt(sandbox.workspace, '.agents/skills/alpha/SKILL.md')),
        ).toBe(skillFile('alpha'));
        Vitest.expect(yield* Effect.promise(() => pathExists(join(target, 'CHANGELOG.md')))).toBe(
          true,
        );
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/alpha/CHANGELOG.md'),
          ),
        ).toBe('# one\n');
        Vitest.expect(
          yield* Effect.promise(() =>
            readAt(sandbox.workspace, '.agents/skills/alpha/docs/guide.md'),
          ),
        ).toBeUndefined();
        Vitest.expect((yield* Effect.promise(() => stat(guide))).isDirectory()).toBe(true);
        Vitest.expect(yield* Effect.promise(() => leftoversIn(target))).toStrictEqual([]);
        Vitest.expect(yield* Effect.promise(() => leftoversIn(join(target, 'docs')))).toStrictEqual(
          [],
        );
      }),
    ),
  );

  Vitest.it.effect('removes every directory it created when staging fails', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        // A name at the filesystem's limit leaves no room for the staged
        // sibling's suffix, so the second file fails after both directories
        // (`alpha` and `alpha/docs`) have been created.
        const long = `${'x'.repeat(246)}.md`;
        yield* Effect.promise(() =>
          writeSkill(sandbox.checkout, 'alpha', { files: { [`docs/${long}`]: '# long\n' } }),
        );

        const refusal = yield* Sync.runSync({
          from: sandbox.checkout,
          dir: sandbox.workspace,
        }).pipe(Effect.flip);

        Vitest.expect(refusal).toContain('cannot write');
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(store(sandbox.workspace), 'alpha'))),
        ).toBe(false);
        // Cleanup runs child-first, so the whole store it created is gone.
        Vitest.expect(
          yield* Effect.promise(() => pathExists(join(sandbox.workspace, '.agents'))),
        ).toBe(false);
      }),
    ),
  );

  Vitest.it.effect('refuses a missing source store and names a typeable fix', () =>
    withSandbox((sandbox) =>
      Effect.gen(function* () {
        const absent = join(sandbox.checkout, 'absent');
        const refusal = yield* Sync.runSync({ from: absent, dir: sandbox.workspace }).pipe(
          Effect.flip,
        );
        Vitest.expect(refusal).toContain('no skills store');
        Vitest.expect(refusal).toContain('/mf-skills sync --source <checkout>');

        const binaryRefusal = yield* Sync.runSync({
          from: absent,
          dir: sandbox.workspace,
          invocation: 'mf-skills sync',
        }).pipe(Effect.flip);
        Vitest.expect(binaryRefusal).toContain('mf-skills sync --source <checkout>');
        Vitest.expect(binaryRefusal).not.toContain('/mf-skills sync');
      }),
    ),
  );
});
