import { NodeServices } from '@effect/platform-node';
import { Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { describe, type Identity } from '../build-info/index.js';
import { read as readStore, type StoreState } from '../store/index.js';

/**
 * The shared CLI surface for build identity.
 *
 * One runner (`run`) resolves the owning package's identity for `--version`
 * and runs the command tree; one factory (`versionCommand`) builds the
 * `version` subcommand each CLI registers. Rendering lives here too, so the
 * human form, `--json`, and `--version` cannot disagree.
 */

/** The installed skill store, when the workspace has one. */
export interface StoreReport {
  readonly status: 'managed' | 'unmanaged';
  readonly version?: string | undefined;
  readonly commit?: string | undefined;
  readonly syncedAt?: string | undefined;
}

/** Identity plus what the workspace under `--dir` received. */
export interface VersionReport extends Identity {
  readonly store?: StoreReport | undefined;
}

/** Shrink a store state to the fields a version report prints. */
export const storeReport = (state: StoreState): StoreReport | undefined => {
  if (state.status === 'absent') return undefined;
  if (state.status === 'unmanaged') return { status: 'unmanaged' };
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

/** One store line: `unmanaged`, or `<version> (<commit>)`. */
const storeLine = (store: StoreReport): string => {
  if (store.status === 'unmanaged') return 'unmanaged';
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

/** Options for the `version` subcommand. */
export interface VersionCommandOptions {
  /** Directory holding the CLI's own `package.json`. */
  readonly packageRoot: string;
  /** Working directory used when `--dir` is absent. */
  readonly cwd?: string | undefined;
}

/**
 * Build the `version` subcommand for one CLI.
 *
 * The manifest is read here rather than passed in, so this command stays a
 * plain subcommand a package can register in its own tree — keeping that
 * tree's `Command.provide` layers in force.
 * @param options - the CLI package directory and the default workspace root
 * @returns the command to register alongside the CLI's other subcommands
 */
export const versionCommand = (options: VersionCommandOptions) =>
  Command.make('version', { json: jsonFlag, dir: dirFlag }, (config) =>
    Effect.gen(function* () {
      const identity = yield* describe({ packageRoot: options.packageRoot });
      const root = Option.getOrUndefined(config.dir) ?? options.cwd ?? process.cwd();
      const store = yield* readStore(root);
      const value = report(identity, store);
      yield* Console.log(config.json ? json(value) : human(value));
    }),
  ).pipe(Command.withDescription('Print this CLI build identity and the installed store version.'));

/** Options for the shared binary runner. */
export interface RunOptions<Name extends string, Input, ContextInput, E> {
  /** The CLI's root command, including its own `version` subcommand. */
  readonly command: Command.Command<Name, Input, ContextInput, E, NodeServices.NodeServices>;
  /** Directory holding the CLI's own `package.json`. */
  readonly packageRoot: string;
}

/**
 * Run one `mf-*` binary.
 *
 * Resolves the identity once for `--version`, then delegates argv, help,
 * completion, and error rendering to `effect/cli`. An identity failure prints
 * its message to stderr and exits 1; command failures keep the
 * [`Command.run`] behaviour each binary already had.
 * @param options - root command and package directory
 */
export const run = <Name extends string, Input, ContextInput, E>(
  options: RunOptions<Name, Input, ContextInput, E>,
): void => {
  const program = Effect.gen(function* () {
    const identity = yield* describe({ packageRoot: options.packageRoot }).pipe(
      Effect.tapError((message) => Console.error(message)),
    );
    yield* Command.run(options.command, { version: identity.version });
  }).pipe(Effect.provide(NodeServices.layer));

  program.pipe(Effect.runPromise).catch(() => {
    process.exitCode = 1;
  });
};
