import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Cause, Effect, FileSystem, Layer, Path } from 'effect';
import { SpecStore } from '../../../services/index.js';
import { DEFAULT_ROOT, SurfaceError, diagnoseCause, storeDirOf, which } from '../index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** A throwaway workspace plus the services used to seed it. */
interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  /** Workspace root that holds `.git` and the specs directory. */
  readonly dir: string;
  /** `<dir>/.agents/@montflow/specs`. */
  readonly root: string;
}

/** Create a temp workspace with one `SPEC.md` per named spec. */
const prepare = (specNames: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const root = path.join(dir, DEFAULT_ROOT);
    for (const name of specNames) {
      const specDir = path.join(root, name);
      yield* fs.makeDirectory(specDir, { recursive: true });
      yield* fs.writeFileString(path.join(specDir, 'SPEC.md'), `# ${name}\n`);
    }
    return { fs, path, dir, root };
  });

/** Write `<dir>/.git/HEAD` with a branch ref. */
const writeGitDir = (work: Work, branch: string) =>
  Effect.gen(function* () {
    const git = work.path.join(work.dir, '.git');
    yield* work.fs.makeDirectory(git, { recursive: true });
    yield* work.fs.writeFileString(work.path.join(git, 'HEAD'), `ref: refs/heads/${branch}\n`);
  });

/** Write `<dir>/.git/HEAD` with a bare commit, the detached form. */
const writeDetached = (work: Work) =>
  Effect.gen(function* () {
    const git = work.path.join(work.dir, '.git');
    yield* work.fs.makeDirectory(git, { recursive: true });
    yield* work.fs.writeFileString(
      work.path.join(git, 'HEAD'),
      '0123456789abcdef0123456789abcdef01234567\n',
    );
  });

/** Run `which` against a workspace with the file-backed store. */
const runWhich = (work: Work, options: { readonly branch?: string } = {}) =>
  which(work.root, { branch: options.branch, workspace: work.dir }).pipe(
    Effect.provide(SpecStore.Default),
    Effect.provide(PlatformLayer),
  );

/** Render a failed `which` through the CLI diagnostic path. */
const diagnose = (error: SurfaceError | SpecStore.StoreError): string =>
  diagnoseCause(Cause.fail(error), {
    path: 'specs',
    rerun: 'mf-specs which',
    verbose: false,
  }).output;

Vitest.describe('Cli.which runtime', () => {
  Vitest.it.effect('reads a directory .git and resolves the exact spec', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['other-spec', 'ship-login']);
      yield* writeGitDir(work, 'feat/ship-login');
      const report = yield* runWhich(work);
      Vitest.expect(report.name).toBe('ship-login');
      Vitest.expect(report.branch).toBe('feat/ship-login');
      Vitest.expect(report.feature).toBe('ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('resolves a unique prefix match from the checked-out branch', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login', 'ship-login-v2-api']);
      yield* writeGitDir(work, 'feat/ship');
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      Vitest.expect(diagnose(error)).toContain('code     SPEC_AMBIGUOUS');

      const unique = yield* prepare(['ship-login', 'other-spec']);
      yield* writeGitDir(unique, 'feat/ship');
      Vitest.expect((yield* runWhich(unique)).name).toBe('ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('lists both candidates and both --name values for an ambiguous match', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['spec-one', 'spec-two', 'ship-login']);
      yield* writeGitDir(work, 'feat/spec');
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      const found = error.diagnostics[0];
      Vitest.expect(found?.code).toBe('SPEC_AMBIGUOUS');
      Vitest.expect(found?.path).toBe(work.root);
      Vitest.expect(found?.field).toBe('branch');
      Vitest.expect(found?.actual).toContain('spec-one, spec-two');
      Vitest.expect(found?.fix).toContain('--name spec-one');
      Vitest.expect(found?.fix).toContain('--name spec-two');
      Vitest.expect(found?.next).toBe('ask the user');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('takes the no-match path for a branch without a prefix', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      yield* writeGitDir(work, 'wip/ship-login');
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     SPEC_NO_MATCH');
      Vitest.expect(text).toContain('conventional prefix');
      Vitest.expect(text).toContain('--name ship-login');
      Vitest.expect(text).toContain('next     ask the user');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('ignores an unreadable unrelated file in another spec', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['other-spec', 'ship-login']);
      yield* writeGitDir(work, 'feat/ship-login');
      const notes = work.path.join(work.root, 'other-spec', 'notes.txt');
      yield* work.fs.writeFileString(notes, 'private\n');
      yield* work.fs.chmod(notes, 0o000);

      const report = yield* runWhich(work);
      Vitest.expect(report.name).toBe('ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('takes the no-match path for a detached HEAD and says detached', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      yield* writeDetached(work);
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     SPEC_NO_MATCH');
      Vitest.expect(text).toContain('detached');
      Vitest.expect(text).toContain('actual   detached');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('follows a .git file into a worktree gitdir', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      const gitDir = work.path.join(work.dir, 'gitdirs', 'ship-login');
      yield* work.fs.makeDirectory(gitDir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(gitDir, 'HEAD'),
        'ref: refs/heads/feat/ship-login\n',
      );
      yield* work.fs.writeFileString(
        work.path.join(work.dir, '.git'),
        'gitdir: gitdirs/ship-login\n',
      );
      Vitest.expect((yield* runWhich(work)).name).toBe('ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('takes the no-match path for a .git file with no gitdir line', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      yield* work.fs.writeFileString(work.path.join(work.dir, '.git'), 'not a worktree\n');
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     SPEC_NO_MATCH');
      Vitest.expect(text).toContain("no 'gitdir:' line");
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('takes the no-match path when .git is missing', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const text = diagnose(error);
      Vitest.expect(text).toContain('missing .git');
      Vitest.expect(text).toContain('--name ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('lets --branch override detection without reading .git', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      const report = yield* runWhich(work, { branch: 'feat/ship-login' });
      Vitest.expect(report.name).toBe('ship-login');
      Vitest.expect(report.branch).toBe('feat/ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('resolves from a custom --dir workspace root', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      yield* writeGitDir(work, 'feat/ship-login');
      const report = yield* which(storeDirOf(work.dir), { workspace: work.dir }).pipe(
        Effect.provide(SpecStore.Default),
        Effect.provide(PlatformLayer),
      );
      Vitest.expect(report.name).toBe('ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('ignores a spec directory that has no SPEC.md', () =>
    Effect.gen(function* () {
      const work = yield* prepare(['ship-login']);
      yield* work.fs.makeDirectory(work.path.join(work.root, 'empty-dir'), { recursive: true });
      yield* writeGitDir(work, 'feat/empty-dir');
      const error = yield* runWhich(work).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics[0]?.actual).toBe('feat/empty-dir · candidates ship-login');
    }).pipe(Effect.provide(PlatformLayer)),
  );
});
