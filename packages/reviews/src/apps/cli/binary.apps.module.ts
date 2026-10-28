import { Console, Effect, Layer, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { ProfileStore } from '@montflow/profiles';
import { SpecStore } from '@montflow/specs';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import manifest from '../../../package.json' with { type: 'json' };
import { ProfileProbe, ReviewStore } from '../../services/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/** This package's root: three levels up from `src/apps/cli`. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

/** Identity embedded from this package's manifest, so a compiled binary keeps it. */
export const PACKAGE_IDENTITY = {
  name: manifest.name,
  version: manifest.version,
} satisfies BuildInfo.GeneratedIdentity;

/**
 * The `mf-reviews` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `engines` plus a renderer, so the binary
 * and the `/mf-reviews` slash command cannot disagree about behaviour — the
 * token contract lives in `renderers`, and `--verbose` is the only thing this
 * layer adds.
 */

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Workspace-root override, on every store-touching command. */
const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');

/** `--verbose`: add per-item detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Show per-item detail. Default is token-lean.');

/** The `name` positional every series command takes. */
const nameArg = Argument.string('name').pipe(
  Argument.withDescription('Review series name (the directory slug).'),
);

/** Where the workspace root is for this invocation: `--dir` overrides the cwd. */
const scope = (dir: Option.Option<string>): Engines.StoreScope => ({
  cwd: opt(dir) ?? process.cwd(),
});

/** Print an engine success or its refusal, setting a non-zero exit on failure. */
const report = <A, R>(
  self: Effect.Effect<A, string, R>,
  render: (value: A) => string,
): Effect.Effect<void, never, R> =>
  self.pipe(
    Effect.matchEffect({
      onFailure: (message) => Console.log(message).pipe(Effect.andThen(exitFailed)),
      onSuccess: (value) => Console.log(render(value)),
    }),
  );

/** How this front end spells the actions, for the fix-it text it emits. */
const BINARY_DOCTOR_INVOCATION = 'mf-reviews doctor';

/** Mark the process as failed without failing the handler. */
const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

const doctorCommand = Command.make(
  'doctor',
  {
    check: optionalBoolean(
      'check',
      'Report only; never write. Non-zero when the skills are unusable.',
    ),
    dir: dirFlag,
    verbose: verboseFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const root = opt(config.dir) ?? process.cwd();
      const result = yield* Engines.doctor(root, config.check, BINARY_DOCTOR_INVOCATION);
      yield* Console.log(Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Install or verify the packaged review skills.'));

const listCommand = Command.make('list', { dir: dirFlag, verbose: verboseFlag }, (config) =>
  report(Engines.list(scope(config.dir)), (series) =>
    Renderers.list(series, { verbose: config.verbose }),
  ),
).pipe(Command.withDescription('List review series.'));

const showCommand = Command.make(
  'show',
  {
    dir: dirFlag,
    round: optionalString('round', 'Round directory, e.g. 001. Default is the ledger.'),
    name: nameArg,
  },
  (config) =>
    report(Engines.show(scope(config.dir), config.name, opt(config.round)), (text) => text),
).pipe(Command.withDescription('Print a series ledger, or one round file.'));

const verifyCommand = Command.make(
  'verify',
  {
    dir: dirFlag,
    name: Argument.string('name').pipe(
      Argument.withDescription('Review series name. Omit to verify every series.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Verify every series in the store.'),
    verbose: verboseFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const name = opt(config.name);
      if (config.all || name === undefined) {
        const all = yield* Engines.verifyAll(scope(config.dir));
        yield* Console.log(Renderers.verifyAll(all, { verbose: config.verbose }));
        if (all.issueCount > 0) yield* exitFailed;
        return yield* Effect.void;
      }
      const verifyReport = yield* Engines.verifySeries(scope(config.dir), name);
      yield* Console.log(Renderers.verify(verifyReport, { verbose: config.verbose }));
      if (verifyReport.entries.some((entry) => !entry.result.valid)) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription(
    'Mechanically verify one or every review series. Non-zero when any fails.',
  ),
);

/** Flags shared by `create` and its `new` alias. */
const createFlags = {
  dir: dirFlag,
  name: nameArg,
  target: optionalString('target', 'What the series reviews. Defaults to the series name.'),
  profile: optionalString('profile', 'Reviewer profile to bind the series to.'),
  round: optionalString('round', 'Round directory to create. Default is the next free round.'),
};

const createCommand = Command.make('create', createFlags, (config) =>
  report(
    Engines.scaffold({
      ...scope(config.dir),
      name: config.name,
      target: opt(config.target),
      round: opt(config.round),
      profile: opt(config.profile),
    }),
    Renderers.created,
  ),
).pipe(Command.withDescription('Create a review series and its first round.'));

const newCommand = Command.make('new', createFlags, (config) =>
  report(
    Engines.scaffold({
      ...scope(config.dir),
      name: config.name,
      target: opt(config.target),
      round: opt(config.round),
      profile: opt(config.profile),
    }),
    Renderers.created,
  ),
).pipe(Command.withDescription('Alias of `create`.'));

const resumeCommand = Command.make('resume', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.resume(scope(config.dir), config.name), Renderers.resumed),
).pipe(
  Command.withDescription('Show where an existing review left off, and the round to continue.'),
);

/** The root command the binary runs. */
export const rootCommand = Command.make('mf-reviews').pipe(
  Command.withDescription(
    'Inspect, verify, and scaffold review series stored in .agents/@montflow/reviews.',
  ),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    showCommand,
    verifyCommand,
    createCommand,
    newCommand,
    resumeCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
  Command.provide(
    Layer.mergeAll(
      ReviewStore.Default,
      ProfileProbe.Default,
      SpecStore.Default,
      ProfileStore.Default,
    ),
  ),
);
