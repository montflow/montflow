import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

/**
 * Identity for one `mf-*` CLI: the package it belongs to, the version its
 * manifest declares, and the git state of the checkout that contains it.
 *
 * The path is deliberately passive — reads a manifest and asks `git` about the
 * checkout, never the network, and never writes. A shipped binary or a tarball
 * install has no git facts to report, so those fields are absent instead of
 * failing the command.
 */

/** Where the version came from: the package manifest, or a build-time identity. */
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
  /** Root of the checkout that contains the package; absent for a generated identity. */
  readonly checkout?: string | undefined;
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
  /** Extra environment for the git probes, mainly for deterministic tests. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** The owning package manifest could not be read. */
export class BuildInfoError extends Schema.TaggedError<BuildInfoError>()('BuildInfo.Error', {
  message: Schema.String,
}) {}

const Manifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});

/** One read-only git answer; `undefined` when git is absent or the command failed. */
interface GitAnswer {
  readonly stdout: string | undefined;
}

/** Repo-location variables a caller may export; probes must not inherit them. */
const GIT_LOCATION_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
] as const;

/** Apply the caller's explicit test env, then wipe repo-location overrides. */
const probeEnv = (env: Readonly<Record<string, string | undefined>> | undefined) => {
  const overrides = { ...env };
  for (const key of GIT_LOCATION_KEYS) overrides[key] = undefined;
  return overrides;
};

/** Run one git command and collect stdout, or an absent answer on any failure. */
const runGit = (
  cwd: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>> | undefined,
) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make('git', args, {
      cwd,
      stderr: 'ignore',
      env: probeEnv(env),
      extendEnv: true,
    });
    const stdout = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString);
    const code = yield* handle.exitCode;
    return { stdout: code === 0 ? stdout.trim() : undefined } satisfies GitAnswer;
  }).pipe(
    Effect.scoped,
    Effect.orElseSucceed((): GitAnswer => ({ stdout: undefined })),
  );

/**
 * Run one read-only git command in `cwd`.
 *
 * `stderr` is ignored and a spawn failure is a failed answer rather than a
 * command failure: the caller decides whether missing git means "no facts"
 * (always, for identity) or a reason to report.
 */
const git = Effect.fnUntraced(function* (
  cwd: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string | undefined>> | undefined,
) {
  return yield* runGit(cwd, args, env);
});

/** Git facts about the checkout rooted at (or above) `cwd`. */
interface GitFacts {
  readonly checkout: string | undefined;
  readonly commit: string | undefined;
  readonly dirty: boolean | undefined;
  readonly ref: string | undefined;
}

/** Ask git for the checkout root, `HEAD`, its branch, and tree cleanliness. */
const gitFacts = Effect.fnUntraced(function* (
  cwd: string,
  env: Readonly<Record<string, string | undefined>> | undefined,
) {
  const root = yield* git(cwd, ['rev-parse', '--show-toplevel'], env);
  if (root.stdout === undefined) {
    return {
      checkout: undefined,
      commit: undefined,
      dirty: undefined,
      ref: undefined,
    } satisfies GitFacts;
  }
  const commit = yield* git(cwd, ['rev-parse', 'HEAD'], env);
  const ref = yield* git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], env);
  // `--no-optional-locks` keeps this status read from refreshing the index.
  // `--untracked-files=normal` overrides `status.showUntrackedFiles=no`: a
  // checkout with unshipped files is not the commit it claims to be, whatever
  // the user's git config says. `--ignore-submodules=none` does the same for
  // submodule dirtiness.
  const status = yield* git(
    cwd,
    [
      '--no-optional-locks',
      'status',
      '--porcelain',
      '--untracked-files=normal',
      '--ignore-submodules=none',
    ],
    env,
  );
  return {
    checkout: root.stdout,
    commit: commit.stdout,
    dirty: status.stdout !== undefined ? status.stdout !== '' : undefined,
    ref: ref.stdout,
  } satisfies GitFacts;
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
const readManifest = Effect.fnUntraced(function* (packageRoot: string) {
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
 * generated identity is used verbatim and `source` says so — no git facts are
 * borrowed from whatever checkout happens to contain the package root, because
 * that checkout is not the one that produced the build. With neither a manifest
 * nor a generated identity, the effect fails instead of inventing a version.
 * @param options - the CLI package directory, generated fallback, and probe env
 * @returns the identity, or a tagged failure naming the unreadable manifest
 */
export const describe = Effect.fn('BuildInfo.describe')(function* (options: DescribeOptions) {
  const path = yield* Path.Path;
  const packageRoot = path.resolve(options.packageRoot);
  const manifest = yield* readManifest(packageRoot);

  if (manifest === undefined) {
    if (options.generated === undefined) {
      return yield* Effect.fail(
        new BuildInfoError({
          message: `build-info: cannot read a package.json at '${packageRoot}' — run the CLI from its checkout, or supply a generated identity`,
        }),
      );
    }
    return {
      name: options.generated.name,
      version: options.generated.version,
      source: 'generated' as const,
    };
  }

  const facts = yield* gitFacts(packageRoot, options.env);
  return {
    name: manifest.name,
    version: manifest.version,
    commit: facts.commit,
    dirty: facts.dirty,
    ref: facts.ref,
    checkout: facts.checkout ?? packageRoot,
    source: 'package' as const,
  };
});
