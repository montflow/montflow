import { NodeServices } from '@effect/platform-node';
import { Console, Effect, Match, Option, Stdio } from 'effect';
import { CliError } from 'effect/unstable/cli';
import { Command, Flag } from 'effect/unstable/cli';
import {
  type BuildInfoError,
  describe,
  type GeneratedIdentity,
  type Identity,
} from '../build-info/index.js';
import { read as readStore, type StoreState } from '../store/index.js';
import {
  check as runUpdateCheck,
  claimNotice,
  shouldAnnounce,
  skipReason,
  type Verdict,
} from '../update-check/index.js';

/**
 * The shared CLI surface for build identity.
 *
 * One runner (`run`) executes the command tree with the version its package
 * manifest declares; one factory (`versionCommand`) builds the `version`
 * subcommand each CLI registers; one effect (`versionReport`) resolves the
 * full identity plus the installed store. Rendering lives here too, so the
 * human form, `--json`, and `--version` cannot disagree.
 */

/** The installed skill store, when the workspace has one. */
export interface StoreReport {
  readonly status: 'managed' | 'unmanaged' | 'corrupt' | 'unreadable' | 'unsupported';
  readonly version?: string | undefined;
  readonly commit?: string | undefined;
  readonly syncedAt?: string | undefined;
  readonly schemaVersion?: number | undefined;
}

/** Identity plus what the workspace under `--dir` received. */
export interface VersionReport extends Identity {
  readonly store?: StoreReport | undefined;
}

/** Shrink a store state to the fields a version report prints. */
export const storeReport = (state: StoreState): StoreReport | undefined =>
  Match.value(state).pipe(
    Match.when({ status: 'absent' }, () => undefined),
    Match.when({ status: 'unmanaged' }, () => ({ status: 'unmanaged' }) satisfies StoreReport),
    Match.when({ status: 'corrupt' }, () => ({ status: 'corrupt' }) satisfies StoreReport),
    Match.when({ status: 'unreadable' }, () => ({ status: 'unreadable' }) satisfies StoreReport),
    Match.when({ status: 'unsupported' }, (unsupported): StoreReport => ({
      status: 'unsupported',
      schemaVersion: unsupported.schemaVersion,
    })),
    Match.when({ status: 'managed' }, (managed): StoreReport => ({
      status: 'managed',
      version: managed.manifest.source.version,
      commit: managed.manifest.source.commit,
      syncedAt: managed.manifest.syncedAt,
    })),
    Match.exhaustive,
  );

/** Attach the store's version to an identity. */
export const report = (identity: Identity, store: StoreState): VersionReport => ({
  ...identity,
  store: storeReport(store),
});

const orUnknown = (value: string | undefined): string => value ?? 'unknown';
const orUnknownBoolean = (value: boolean | undefined): string =>
  value === undefined ? 'unknown' : value ? 'yes' : 'no';

/** One store line: a state, or `<version> (<commit>)` for a managed store. */
const storeLine = (store: StoreReport): string =>
  Match.value(store).pipe(
    Match.when({ status: 'unmanaged' }, () => 'unmanaged'),
    Match.when({ status: 'corrupt' }, () => 'corrupt manifest'),
    Match.when({ status: 'unreadable' }, () => 'unreadable manifest'),
    Match.when(
      { status: 'unsupported' },
      (unsupported) => `unsupported manifest (schema ${unsupported.schemaVersion})`,
    ),
    Match.when({ status: 'managed' }, (managed) => {
      const version = orUnknown(managed.version);
      return managed.commit === undefined ? version : `${version} (${managed.commit})`;
    }),
    Match.exhaustive,
  );

/** Human form: one labelled field per line, stable order, no colour. */
export const human = (value: VersionReport): string => {
  const lines = [
    `name      ${value.name}`,
    `version   ${value.version}`,
    `commit    ${orUnknown(value.commit)}`,
    `dirty     ${orUnknownBoolean(value.dirty)}`,
    `ref       ${orUnknown(value.ref)}`,
    `checkout  ${orUnknown(value.checkout)}`,
  ];
  if (value.store !== undefined) lines.push(`store     ${storeLine(value.store)}`);
  return lines.join('\n');
};

/** JSON form: the same fields, with absent git/store facts omitted. */
export const json = (value: VersionReport): string =>
  JSON.stringify({
    name: value.name,
    version: value.version,
    commit: value.commit,
    dirty: value.dirty,
    ref: value.ref,
    checkout: value.checkout,
    source: value.source,
    store: value.store,
  });

/** `mf-skills` from `@montflow/skills`; also the guide anchor. */
export const cliName = (packageName: string) =>
  `mf-${packageName.split('/').at(-1) ?? packageName}`;

/** The one-line stale notice, naming every fact the reader needs. */
export const noticeLine = (cli: string, installed: string, available: string, checkout: string) =>
  `${cli} ${installed} is behind ${available} in ${checkout} — update: guides/updating.md#${cli}`;

/** Plain-language result for `version --check`. */
export const checkLine = (verdict: Verdict) =>
  Match.value(verdict).pipe(
    Match.when({ state: 'behind' }, (behind) => `behind ${behind.available}`),
    Match.when({ state: 'current' }, () => 'current'),
    Match.when({ state: 'ahead' }, (ahead) => `ahead of ${ahead.available}`),
    Match.when({ state: 'unknown' }, (unknown) => `unknown: ${unknown.reason}`),
    Match.when({ state: 'skipped' }, (skipped) => `skipped: ${skipped.reason}`),
    Match.exhaustive,
  );

/** Exit code for a forced check: 1 only when an update is available. */
export const checkExit = (verdict: Verdict): 0 | 1 => (verdict.state === 'behind' ? 1 : 0);

/** The process environment, read once at the binary composition root. */
const environment = (): Readonly<Record<string, string | undefined>> =>
  // oxlint-disable-next-line montflow/no-process-env -- the shared binary runner is the composition root for all five CLIs; this is the environment they run under.
  process.env;

/** `version` flag set, shared by the binary and its help text. */
const jsonFlag = Flag.boolean('json').pipe(
  Flag.withDescription('Print only the JSON identity on stdout.'),
  Flag.withDefault(false),
);

/** Workspace root whose `.agents/skills` store is reported. */
const dirFlag = Flag.string('dir').pipe(
  Flag.withDescription(
    'Workspace root containing .agents/skills. Defaults to the working directory.',
  ),
  Flag.optional,
);

/** Force an update check and report the verdict; exits 1 only when behind. */
const checkFlag = Flag.boolean('check').pipe(
  Flag.withDescription('Check upstream now (bypasses the cache) and exit 1 when behind.'),
  Flag.withDefault(false),
);

/** Options for resolving the full version report. */
export interface VersionReportOptions {
  /** Directory holding the CLI's own `package.json`. */
  readonly packageRoot: string;
  /**
   * Build-time identity used when the manifest is not on disk, so a compiled
   * binary still reports a version.
   */
  readonly generated?: GeneratedIdentity | undefined;
  /** Workspace root containing `.agents/skills`; defaults to the process's. */
  readonly dir?: string | undefined;
}

/**
 * Resolve one CLI's identity and the workspace store state.
 *
 * Shared by the `version` subcommand and the tests, so the command itself stays
 * a thin renderer.
 * @param options - package directory, generated fallback, and workspace root
 * @returns the report, or a tagged manifest failure
 */
export const versionReport = Effect.fn('Cli.versionReport')(function* (
  options: VersionReportOptions,
) {
  const identity = yield* describe({
    packageRoot: options.packageRoot,
    generated: options.generated,
  });
  const store = yield* readStore(options.dir ?? process.cwd());
  return report(identity, store);
});

/** Options for the `version` subcommand. */
export interface VersionCommandOptions {
  /** Directory holding the CLI's own `package.json`. */
  readonly packageRoot: string;
  /** Build-time identity used when the manifest is not on disk. */
  readonly generated?: GeneratedIdentity | undefined;
}

/**
 * Build the `version` subcommand for one CLI.
 *
 * The report is resolved here rather than passed in, so this command stays a
 * plain subcommand a package can register in its own tree — keeping that
 * tree's `Command.provide` layers in force.
 * @param options - the CLI package directory and its generated fallback
 * @returns the command to register alongside the CLI's other subcommands
 */
export const versionCommand = (options: VersionCommandOptions) =>
  Command.make('version', { json: jsonFlag, dir: dirFlag, check: checkFlag }, (config) =>
    Effect.gen(function* () {
      if (config.check) {
        const identity = yield* describe({
          packageRoot: options.packageRoot,
          generated: options.generated,
        });
        const result = yield* runUpdateCheck({
          packageName: identity.name,
          currentVersion: identity.version,
          checkout: identity.checkout ?? options.packageRoot,
          currentCommit: identity.commit,
          env: environment(),
          args: process.argv.slice(2),
          force: true,
        });
        yield* Console.log(
          config.json ? JSON.stringify(result.verdict) : checkLine(result.verdict),
        );
        if (checkExit(result.verdict) === 1) {
          yield* Effect.sync(() => {
            process.exitCode = 1;
          });
        }
        return;
      }

      const value = yield* versionReport({
        packageRoot: options.packageRoot,
        generated: options.generated,
        dir: Option.getOrUndefined(config.dir),
      });
      yield* Console.log(config.json ? json(value) : human(value));
    }),
  ).pipe(Command.withDescription('Print this CLI build identity and the installed store version.'));

/** Options for the shared binary runner. */
export interface RunOptions<Name extends string, Input, ContextInput, E> {
  /** The CLI's root command, including its own `version` subcommand. */
  readonly command: Command.Command<Name, Input, ContextInput, E, NodeServices.NodeServices>;
  /** Identity embedded from the package manifest, used by `--version` and the notice. */
  readonly identity: GeneratedIdentity;
  /** Directory holding the CLI's own `package.json`. */
  readonly packageRoot: string;
}

/** Options for the notice probe. */
export interface AnnounceOptions {
  readonly packageRoot: string;
  readonly identity: GeneratedIdentity;
  readonly args: ReadonlyArray<string>;
}

/**
 * Print the stale notice when the cached verdict says this checkout is behind.
 *
 * Never fails and never changes an exit code: a missing identity, a probe
 * failure, a current checkout, or an already-notified checkout all return
 * silently.
 * @param options - package directory, embedded identity, and argv
 */
export const announce = Effect.fn('Cli.announce')(function* (options: AnnounceOptions) {
  if (skipReason(environment(), options.args) !== undefined) return;
  if (!shouldAnnounce(options.args)) return;

  const identity = yield* describe({
    packageRoot: options.packageRoot,
    generated: options.identity,
  }).pipe(Effect.orElseSucceed(() => undefined));
  if (identity === undefined) return;

  const checkout = identity.checkout ?? options.packageRoot;
  const result = yield* runUpdateCheck({
    packageName: identity.name,
    currentVersion: identity.version,
    checkout,
    currentCommit: identity.commit,
    env: environment(),
    args: options.args,
  });
  if (result.verdict.state !== 'behind') return;

  const claimed = yield* claimNotice({
    packageName: identity.name,
    currentVersion: identity.version,
    checkout,
    env: environment(),
  });
  if (!claimed) return;

  yield* Console.error(
    noticeLine(cliName(identity.name), identity.version, result.verdict.available, checkout),
  );
});

/**
 * Run one `mf-*` binary.
 *
 * Delegates argv, help, `--version`, completion, and error rendering to
 * `effect/cli`, providing the Node platform layer. The version is passed in
 * from the package's own manifest, so no identity probe runs on commands that
 * do not ask for one; the stale notice runs before the command and cannot
 * change its exit code.
 * @param options - root command, embedded identity, and package directory
 * @returns the program effect, for tests that drive it with a fake Stdio
 */
export const execute = <Name extends string, Input, ContextInput, E>(
  options: RunOptions<Name, Input, ContextInput, E>,
): Effect.Effect<
  void,
  E | import('effect/unstable/cli/CliError').CliError,
  NodeServices.NodeServices
> =>
  Effect.gen(function* () {
    yield* announce({
      packageRoot: options.packageRoot,
      identity: options.identity,
      args: process.argv.slice(2),
    });
    // Strip the shared opt-out before `effect/cli` parses argv; it is a runner
    // flag, not one each package's command table has to declare.
    const stdio = yield* Stdio.Stdio;
    const args = yield* stdio.args;
    const filtered = args.filter((arg) => arg !== '--no-update-check');
    yield* Command.run(options.command, { version: options.identity.version }).pipe(
      Effect.provideService(Stdio.Stdio, { ...stdio, args: Effect.succeed(filtered) }),
    );
  });

/**
 * Run one `mf-*` binary and translate a failure into a non-zero exit.
 * @param options - root command, embedded identity, and package directory
 */
export const run = <Name extends string, Input, ContextInput, E>(
  options: RunOptions<Name, Input, ContextInput, E>,
): void => {
  execute(options)
    .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
    .catch((cause: unknown) => {
      // `Command.run` renders its own CliError; a handler failure or defect was
      // not rendered, so a silent exit-1 would hide the only diagnostic.
      if (!CliError.isCliError(cause)) {
        process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
      }
      process.exitCode = 1;
    });
};

export type { BuildInfoError };
