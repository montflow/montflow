import { NodeServices } from '@effect/platform-node';
import { Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import {
  type BuildInfoError,
  describe,
  type GeneratedIdentity,
  type Identity,
} from '../build-info/index.js';
import { read as readStore, type StoreState } from '../store/index.js';

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
  readonly status: 'managed' | 'unmanaged' | 'corrupt' | 'unsupported';
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
export const storeReport = (state: StoreState): StoreReport | undefined => {
  if (state.status === 'absent') return undefined;
  if (state.status === 'unmanaged') return { status: 'unmanaged' };
  if (state.status === 'corrupt') return { status: 'corrupt' };
  if (state.status === 'unsupported') {
    return { status: 'unsupported', schemaVersion: state.schemaVersion };
  }
  return {
    status: 'managed',
    version: state.manifest.source.version,
    commit: state.manifest.source.commit,
    syncedAt: state.manifest.syncedAt,
  };
};

/** Attach the store's version to an identity. */
export const report = (identity: Identity, store: StoreState): VersionReport => ({
  ...identity,
  store: storeReport(store),
});

const orUnknown = (value: string | undefined): string => value ?? 'unknown';
const orUnknownBoolean = (value: boolean | undefined): string =>
  value === undefined ? 'unknown' : value ? 'yes' : 'no';

/** One store line: a state, or `<version> (<commit>)` for a managed store. */
const storeLine = (store: StoreReport): string => {
  if (store.status === 'unmanaged') return 'unmanaged';
  if (store.status === 'corrupt') return 'corrupt manifest';
  if (store.status === 'unsupported') return `unsupported manifest (schema ${store.schemaVersion})`;
  const version = orUnknown(store.version);
  return store.commit === undefined ? version : `${version} (${store.commit})`;
};

/** Human form: one labelled field per line, stable order, no colour. */
export const human = (value: VersionReport): string => {
  const lines = [
    `name      ${value.name}`,
    `version   ${value.version}`,
    `commit    ${orUnknown(value.commit)}`,
    `dirty     ${orUnknownBoolean(value.dirty)}`,
    `ref       ${orUnknown(value.ref)}`,
    `checkout  ${value.checkout}`,
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
  Command.make('version', { json: jsonFlag, dir: dirFlag }, (config) =>
    Effect.gen(function* () {
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
  /** Version the package manifest declares, used by `--version`. */
  readonly version: string;
}

/**
 * Run one `mf-*` binary.
 *
 * Delegates argv, help, `--version`, completion, and error rendering to
 * `effect/cli`, providing the Node platform layer. The version is passed in
 * from the package's own manifest, so no identity probe runs on commands that
 * do not ask for one.
 * @param options - root command and manifest version
 * @returns the program effect, for tests that drive it with a fake Stdio
 */
export const execute = <Name extends string, Input, ContextInput, E>(
  options: RunOptions<Name, Input, ContextInput, E>,
): Effect.Effect<
  void,
  E | import('effect/unstable/cli/CliError').CliError,
  NodeServices.NodeServices
> => Command.run(options.command, { version: options.version });

/**
 * Run one `mf-*` binary and translate a failure into a non-zero exit.
 * @param options - root command and manifest version
 */
export const run = <Name extends string, Input, ContextInput, E>(
  options: RunOptions<Name, Input, ContextInput, E>,
): void => {
  execute(options)
    .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
    .catch(() => {
      process.exitCode = 1;
    });
};

export type { BuildInfoError };
