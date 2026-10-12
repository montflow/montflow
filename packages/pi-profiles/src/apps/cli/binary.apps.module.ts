import { Console, Effect, Option } from 'effect';
import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { ProfileStore } from '../../services/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-profiles` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function, so
 * the binary and the `/mf-profiles-cli` slash command cannot disagree about
 * behaviour. `--dir` is the workspace root; stores derive from it.
 */

/** Mark the process as failed without failing the handler. */
const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Workspace-root override, on every store-touching command. */
const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');

/** The `name` positional the single-profile commands take. */
const nameArg = Argument.String('name').pipe(
  Argument.withDescription('Profile name (the directory slug).'),
);

/** `verify`'s optional list of profile names. */
const namesArg: Argument.Argument<ReadonlyArray<string>> = Argument.String('name').pipe(
  Argument.variadic,
  Argument.withDescription('Profile names; omit to verify the whole store.'),
);

/** Resolve the workspace root for this invocation. */
const scope = (dir: Option.Option<string>): string => opt(dir) ?? process.cwd();

/** Comma-separated skill names. Blank or absent reads as an empty list. */
const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Semicolon-separated checklist items, so an item may carry commas. */
const checklist = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value === ''
    ? []
    : value
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Fields `create` and `modify` share. */
const fieldsOf = (config: {
  readonly description: Option.Option<string>;
  readonly model: Option.Option<string>;
  readonly skills: Option.Option<string>;
  readonly instructions: Option.Option<string>;
  readonly checklist: Option.Option<string>;
}): Engines.ProfileFields => ({
  description: opt(config.description),
  model: opt(config.model),
  skills: csv(opt(config.skills)),
  instructions: opt(config.instructions),
  checklist: checklist(opt(config.checklist)),
});

/**
 * Print an engine failure and set a non-zero exit, or a successful value
 * through its renderer. Sets the exit inside the handler so `Command.run`
 * cannot print a second, redundant error report.
 */
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

const listCommand = Command.make(
  'list',
  {
    dir: dirFlag,
    status: optionalString(
      'status',
      'Keep only profiles whose file verifies (valid) or fails verification (invalid).',
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const cwd = scope(config.dir);
      const status = yield* Engines.resolveListStatus(opt(config.status));
      const profiles = yield* Engines.list(cwd);
      const shown =
        status === undefined ? profiles : yield* Engines.filterByStatus(cwd, profiles, status);
      const text =
        shown.length === 0 && status !== undefined
          ? `No profiles with status '${status}'.`
          : Renderers.list(shown);
      yield* Console.log(text);
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('List stored profile names.'));

const showCommand = Command.make('show', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.show(scope(config.dir), config.name), Renderers.show),
).pipe(
  Command.withDescription('Print a profile: description, model, skills, instructions, checklist.'),
);

const verifyCommand = Command.make(
  'verify',
  {
    dir: dirFlag,
    name: namesArg,
    all: optionalBoolean('all', 'Verify every profile in the store.'),
    verbose: optionalBoolean('verbose', 'Show passing profiles. Default is token-lean.'),
  },
  (config) =>
    Effect.gen(function* () {
      const names = config.all || config.name.length === 0 ? undefined : config.name;
      const verdict = yield* Engines.verifyAll(scope(config.dir), names);
      yield* Console.log(Renderers.renderVerifyAll(verdict, config.verbose));
      if (verdict.issueCount > 0) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription(
    'Mechanically verify profile files and declared skills. Non-zero on failure.',
  ),
);

const createCommand = Command.make(
  'create',
  {
    dir: dirFlag,
    name: nameArg,
    description: optionalString('description', 'One-line role and job. Required.'),
    model: optionalString('model', 'Preferred model as provider/model-id.'),
    skills: optionalString('skills', 'Comma-separated skill names the run loads.'),
    instructions: optionalString('instructions', 'System-prompt instructions.'),
    checklist: optionalString('checklist', 'Semicolon-separated review checklist items.'),
  },
  (config) =>
    report(Engines.create(scope(config.dir), config.name, fieldsOf(config)), Renderers.saved),
).pipe(Command.withDescription('Create a profile file.'));

const modifyCommand = Command.make(
  'modify',
  {
    dir: dirFlag,
    name: nameArg,
    description: optionalString('description', 'Replacement one-line role and job. Omit to keep.'),
    model: optionalString('model', 'Replacement preferred model. Omit to keep.'),
    skills: optionalString('skills', 'Replacement comma-separated skill names. Omit to keep.'),
    instructions: optionalString('instructions', 'Replacement instructions. Omit to keep.'),
    checklist: optionalString('checklist', 'Replacement checklist items. Omit to keep.'),
  },
  (config) =>
    report(Engines.modify(scope(config.dir), config.name, fieldsOf(config)), Renderers.saved),
).pipe(Command.withDescription('Update a profile file in place.'));

const deleteCommand = Command.make('delete', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.remove(scope(config.dir), config.name), (profile) =>
    Renderers.deleted(profile.name),
  ),
).pipe(Command.withDescription('Delete a profile directory.'));

/** The root command the binary runs. */
export const rootCommand = Command.make('mf-profiles').pipe(
  Command.withDescription(
    'Inspect, verify, and manage agent profiles in .agents/@montflow/profiles.',
  ),
  Command.withSubcommands([
    listCommand,
    showCommand,
    verifyCommand,
    createCommand,
    modifyCommand,
    deleteCommand,
  ]),
  Command.provide(ProfileStore.Default),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = '0.0.1';
