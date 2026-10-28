import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess } from 'effect/unstable/process';
import type { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';

/**
 * Identity for one `mf-*` CLI: the package it belongs to, the version its
 * manifest declares, and the git state of the checkout that contains it.
 *
 * The path is deliberately passive — reads a manifest and asks `git` about the
 * checkout, never the network, and never writes. A shipped binary or a tarball
 * install has no git facts to report, so those fields are absent instead of
 * failing the command.
 */

/** Where the version came from: the package manifest, or a build-time fallback. */
export type IdentitySource = 'package' | 'generated';

/** What `describe` reports. Optional git fields are absent outside a checkout. */
export interface Identity {
  /** Package name from the owning `package.json`, e.g. `@montflow/skills`. */
  readonly name: string;
  /** Package version from the owning `package.json`. */
  readonly version: string;
  /** Full `HEAD` commit, absent outside a git checkout. */
  readonly commit?: string | undefined;
  /** True when the checkout has staged, unstaged, or untracked changes. */
  readonly dirty?: boolean | undefined;
  /** Branch name, or `HEAD` when detached; absent outside a git checkout. */
  readonly ref?: string | undefined;
  /** Root of the checkout that contains the package. */
  readonly checkout: string;
  /** Which source supplied {@link version}. */
  readonly source: IdentitySource;
}

/** A version baked into a build, for a package directory that is not on disk. */
export interface GeneratedIdentity {
  readonly name: string;
  readonly version: string;
}

/** How to locate the identity. */
export interface DescribeOptions {
  /** Directory holding the owning CLI's `package.json`. */
  readonly packageRoot: string;
  /**
   * Build-time identity used only when `package.json` cannot be read, which is
   * the compiled-binary case. Absent means an unreadable manifest is an error.
   */
  readonly generated?: GeneratedIdentity | undefined;
}

const Manifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});

/** One read-only git answer; `undefined` when git is absent or the command failed. */
interface GitAnswer {
  readonly stdout: string | undefined;
}

/**
 * Run one read-only git command in `cwd`.
 *
 * `stderr` is ignored and a spawn failure is a failed answer rather than a
 * command failure: the caller decides whether missing git means "no facts"
 * (always, for identity) or a reason to report.
 */
const git = (
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<GitAnswer, never, ChildProcessSpawner> =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make('git', args, { cwd, stderr: 'ignore' });
    const stdout = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
    const code = yield* handle.exitCode;
    return { stdout: code === 0 ? stdout.trim() : undefined };
  }).pipe(
    Effect.scoped,
    Effect.orElseSucceed((): GitAnswer => ({ stdout: undefined })),
  );

/** Git facts about the checkout rooted at (or above) `cwd`. */
interface GitFacts {
  readonly checkout: string | undefined;
  readonly commit: string | undefined;
  readonly dirty: boolean | undefined;
  readonly ref: string | undefined;
}

/** Ask git for the checkout root, `HEAD`, its branch, and tree cleanliness. */
const gitFacts = (cwd: string): Effect.Effect<GitFacts, never, ChildProcessSpawner> =>
  Effect.gen(function* () {
    const root = yield* git(cwd, ['rev-parse', '--show-toplevel']);
    if (root.stdout === undefined) {
      return { checkout: undefined, commit: undefined, dirty: undefined, ref: undefined };
    }
    const commit = yield* git(cwd, ['rev-parse', 'HEAD']);
    const ref = yield* git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    // `--no-optional-locks` keeps this status read from refreshing the index.
    // Untracked files count as dirty: a checkout with unshipped files is not
    // the commit it claims to be.
    const status = yield* git(cwd, ['--no-optional-locks', 'status', '--porcelain']);
    return {
      checkout: root.stdout,
      commit: commit.stdout,
      dirty: status.stdout !== undefined ? status.stdout !== '' : undefined,
      ref: ref.stdout,
    };
  });

/** Decode one `package.json` text, or `undefined` when it is not a manifest. */
const parseManifest = (text: string): { name: string; version: string } | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return Option.getOrUndefined(Schema.decodeUnknownOption(Manifest)(parsed));
  } catch {
    return undefined;
  }
};

/** Read the owning package's manifest, or `undefined` when it cannot be read. */
const readManifest = (
  packageRoot: string,
): Effect.Effect<
  { name: string; version: string } | undefined,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs
      .readFileString(path.join(packageRoot, 'package.json'))
      .pipe(Effect.orElseSucceed(() => undefined));
    return text === undefined ? undefined : parseManifest(text);
  });

/**
 * Describe the build behind one CLI.
 *
 * `packageRoot` names the CLI's own directory, so the version is always the
 * one that package declares. Git facts are read from the checkout containing
 * that directory; a non-git directory yields name, version, checkout, and
 * source only. When the manifest is missing and `generated` is supplied, the
 * generated identity is used and `source` says so; with neither, the effect
 * fails with a readable message instead of inventing a version.
 * @param options - the CLI package directory and an optional generated identity
 * @returns the identity, or a message naming the unreadable manifest
 */
export const describe = (
  options: DescribeOptions,
): Effect.Effect<Identity, string, FileSystem.FileSystem | Path.Path | ChildProcessSpawner> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const packageRoot = path.resolve(options.packageRoot);
    const manifest = yield* readManifest(packageRoot);
    if (manifest === undefined && options.generated === undefined) {
      return yield* Effect.fail(
        `build-info: cannot read a package.json at '${packageRoot}' — run the CLI from its checkout, or supply a generated identity`,
      );
    }

    const facts = yield* gitFacts(packageRoot);
    const base = manifest ?? options.generated;
    if (base === undefined) {
      return yield* Effect.fail(
        `build-info: cannot read a package.json at '${packageRoot}' — run the CLI from its checkout, or supply a generated identity`,
      );
    }

    return {
      name: base.name,
      version: base.version,
      commit: facts.commit,
      dirty: facts.dirty,
      ref: facts.ref,
      checkout: facts.checkout ?? packageRoot,
      source: manifest === undefined ? 'generated' : 'package',
    };
  });
