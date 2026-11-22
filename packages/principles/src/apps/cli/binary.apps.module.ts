import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import packageJson from '../../../package.json' with { type: 'json' };
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-principles` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function. A
 * refusal sets `process.exitCode` inside the handler and never calls
 * `process.exit`, so buffered stdout is flushed. `--dir` is the workspace
 * root; the store derives from it.
 */

/** This package's root: three levels up from `src/apps/cli`. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

/** Identity embedded from this package's manifest, so a compiled binary keeps it. */
export const PACKAGE_IDENTITY = {
  name: packageJson.name,
  version: packageJson.version,
} satisfies BuildInfo.GeneratedIdentity;

/** How this front end spells the actions, for the fix-it text it emits. */
export const INVOCATION = 'mf-principles';

/** Mark the process as failed without failing the handler. */
export const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

/** Print text byte for byte: stdout only, never an added newline. */
export const writeRaw = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(text);
  });

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Workspace-root override, on every command. */
const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');

/** `--human`: readable tables and glyphs. */
const humanFlag = optionalBoolean('human', 'Render readable tables and glyphs.');

/** `--verbose`: add detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Add detail to the same output.');

/** Resolve the workspace root for this invocation. */
const rootOf = (dir: Option.Option<string>): string => Option.getOrUndefined(dir) ?? process.cwd();

/** Print an engine refusal and mark the process failed. */
const refuse = (message: string): Effect.Effect<void> =>
  Console.log(message).pipe(Effect.andThen(exitFailed));

const doctorCommand = Command.make(
  'doctor',
  {
    check: optionalBoolean('check', 'Report only; write nothing. Non-zero when unhealthy.'),
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.doctor(rootOf(config.dir), config.check, INVOCATION);
      yield* Console.log(Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
    }),
).pipe(
  Command.withDescription(
    'Install or verify the packaged principles in .agents/@montflow/principles.',
  ),
);

const listCommand = Command.make(
  'list',
  { human: humanFlag, verbose: verboseFlag, dir: dirFlag },
  (config) =>
    Engines.list(rootOf(config.dir)).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (rows) => Console.log(Renderers.list(rows, config)),
      }),
    ),
).pipe(Command.withDescription('Print the index: one `<name>: <description>` line per principle.'));

const showCommand = Command.make(
  'show',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Principle name (the directory slug).'),
    ),
    dir: dirFlag,
  },
  (config) =>
    Engines.show(rootOf(config.dir), config.name, INVOCATION).pipe(
      Effect.matchEffect({ onFailure: refuse, onSuccess: writeRaw }),
    ),
).pipe(Command.withDescription('Print one principle’s PRINCIPLE.md bytes.'));

const verifyCommand = Command.make(
  'verify',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Principle name. Omit to verify the whole store.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Verify every principle in the store.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const report = yield* Engines.verify(rootOf(config.dir), {
        name: Option.getOrUndefined(config.name),
        all: config.all,
        invocation: INVOCATION,
      });
      yield* Console.log(Renderers.verify(report, config));
      // Warnings do not fail: only an error-severity finding does.
      if (report.issueCount > 0) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(Command.withDescription('Mechanically verify principle files. Non-zero on any error.'));

/** The root command the binary runs. */
export const rootCommand = Command.make(INVOCATION).pipe(
  Command.withDescription('Inspect and verify the principles in .agents/@montflow/principles.'),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    showCommand,
    verifyCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
  Command.provide(Engines.Live),
);
