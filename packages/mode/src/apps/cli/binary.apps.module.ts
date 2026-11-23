import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import packageJson from '../../../package.json' with { type: 'json' };
import * as Roles from '../../modules/roles/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-mode` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function. A
 * refusal prints its fix-it line and sets `process.exitCode` inside the
 * handler, never `process.exit`, so buffered stdout is flushed. `--dir` is the
 * workspace root.
 */

/** This package's root: three levels up from `src/apps/cli`. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

export const PACKAGE_IDENTITY = {
  name: packageJson.name,
  version: packageJson.version,
} satisfies BuildInfo.GeneratedIdentity;

export const INVOCATION = Engines.INVOCATION;

/**
 * Every command path this binary accepts. Skill and playbook text may only
 * name these; a test holds the text and the tree to this list.
 */
export const COMMANDS = [
  'roles',
  'roles show',
  'roles set',
  'roles unset',
  'roles verify',
  'roles resolve',
  'dispatch',
  'version',
] as const;

export const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

const exitWith = (code: number) =>
  Effect.sync(() => {
    process.exitCode = code;
  });

const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');
const humanFlag = optionalBoolean('human', 'Render readable tables and glyphs.');
const verboseFlag = optionalBoolean('verbose', 'Add detail to the same output.');
const harnessFlag = optionalString(
  'harness',
  `The harness you are running in (${Roles.HARNESSES.join(', ')}). Detected when omitted.`,
);
const roleArgument = Argument.String('role').pipe(
  Argument.withDescription(`Role name: ${Roles.ROLES.join(', ')}.`),
);

const rootOf = (dir: Option.Option<string>): string => Option.getOrUndefined(dir) ?? process.cwd();

const refuse = (message: string): Effect.Effect<void> =>
  Console.log(message).pipe(Effect.andThen(exitFailed));

const showHandler = (config: {
  readonly dir: Option.Option<string>;
  readonly human: boolean;
  readonly verbose: boolean;
}) =>
  Engines.show(rootOf(config.dir)).pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: (rows) => Console.log(Renderers.show(rows, config)),
    }),
  );

const showConfig = { human: humanFlag, verbose: verboseFlag, dir: dirFlag };

const showCommand = Command.make('show', showConfig, showHandler).pipe(
  Command.withDescription('Print every role: its seats as specs, or `default`.'),
);

const setCommand = Command.make(
  'set',
  {
    role: roleArgument,
    seat: Flag.String('seat').pipe(
      Flag.withDescription(
        'One seat: candidates in preference order, `harness:model[:effort]`, comma-separated. Repeat for each seat of a panel.',
      ),
      Flag.atLeast(1),
    ),
    dir: dirFlag,
  },
  (config) =>
    Engines.set(rootOf(config.dir), config.role, config.seat).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (row) => Console.log(Renderers.changed(row)),
      }),
    ),
).pipe(Command.withDescription('Set one role’s seats. Refuses a combination its harness rejects.'));

const unsetCommand = Command.make('unset', { role: roleArgument, dir: dirFlag }, (config) =>
  Engines.unset(rootOf(config.dir), config.role).pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: (row) => Console.log(Renderers.changed(row)),
    }),
  ),
).pipe(Command.withDescription('Remove one role, so it resolves to the mf-mode defaults.'));

const verifyCommand = Command.make(
  'verify',
  { human: humanFlag, verbose: verboseFlag, dir: dirFlag },
  (config) =>
    Effect.gen(function* () {
      const report = yield* Engines.verify(rootOf(config.dir));
      yield* Console.log(Renderers.verify(report, config));
      if (report.errorCount > 0) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Check every candidate against what its harness accepts. Non-zero on any error.',
  ),
);

const resolveCommand = Command.make(
  'resolve',
  {
    role: roleArgument,
    harness: harnessFlag,
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Engines.resolve(rootOf(config.dir), config.role, Option.getOrUndefined(config.harness)).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (resolution) => Console.log(Renderers.resolve(resolution, config)),
      }),
    ),
).pipe(
  Command.withDescription(
    'Resolve a role’s seats from this harness: each is `native` (spawn it here), `dispatch` (run `mf-mode dispatch`), or `dropped`.',
  ),
);

const rolesCommand = Command.make('roles', showConfig, showHandler).pipe(
  Command.withDescription(
    'Which harness and model run each role, from .agents/@montflow/mode/roles.json (git-ignored, per user). Bare `roles` is `roles show`.',
  ),
  Command.withSubcommands([showCommand, setCommand, unsetCommand, verifyCommand, resolveCommand]),
);

const dispatchCommand = Command.make(
  'dispatch',
  {
    role: roleArgument,
    seat: Flag.Int('seat').pipe(
      Flag.withDescription('The seat number from `mf-mode roles resolve`.'),
      Flag.withDefault(1),
    ),
    brief: Flag.String('brief').pipe(Flag.withDescription('File holding the kickoff brief.')),
    profile: Flag.String('profile').pipe(
      Flag.withDescription('Profile the worker runs as, or `none`.'),
      Flag.withDefault(Engines.DEFAULT_PROFILE),
    ),
    readOnly: optionalBoolean('read-only', 'The worker may read and run read-only tools only.'),
    harness: harnessFlag,
    dryRun: optionalBoolean('dry-run', 'Print the seat and the exact command; run nothing.'),
    dir: dirFlag,
  },
  (config) =>
    Engines.dispatch(rootOf(config.dir), {
      role: config.role,
      seat: config.seat,
      brief: config.brief,
      profile: config.profile,
      access: config.readOnly ? 'read-only' : 'write',
      harness: Option.getOrUndefined(config.harness),
      dryRun: config.dryRun,
    }).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (result) =>
          result.exitCode === undefined
            ? Console.log(Renderers.dispatchPlan(result))
            : result.exitCode === 0
              ? Effect.void
              : exitWith(result.exitCode),
      }),
    ),
).pipe(
  Command.withDescription(
    'Run one dispatch seat headless on the harness it resolves to, as a profile (default mf-mode-generic-worker). Its report is printed on stdout. Refuses a native or dropped seat.',
  ),
);

/** The root command the binary runs. */
export const rootCommand = Command.make(INVOCATION).pipe(
  Command.withDescription(
    'mf-mode roles and dispatch: which harness and model run delegated work.',
  ),
  Command.withSubcommands([
    rolesCommand,
    dispatchCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
  Command.provide(Engines.Live),
);
