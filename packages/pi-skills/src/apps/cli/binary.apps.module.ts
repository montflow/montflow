import { Console, Effect, Option } from 'effect';
import * as Argument from 'effect/unstable/cli/Argument';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';
import * as Doctor from '../doctor/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-skills` binary's command tree, built with `effect/unstable/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function, so
 * the binary and the `/mf-skills` slash command cannot disagree about
 * behaviour — the token contract lives in `renderers`, and `--verbose` is the
 * only thing this layer adds.
 */

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Store root override, on every store-touching command. */
const dirFlag = optionalString(
  'dir',
  'Workspace root containing .agents/skills. Defaults to the working directory.',
);

/** `--verbose`: add per-item detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Show per-item detail. Default is token-lean.');

/** The `name` positional the single-skill commands take. */
const nameArg = Argument.string('name').pipe(
  Argument.withDescription('Skill name (the directory slug).'),
);

/** Comma-separated list flag. Blank or absent reads as an empty list. */
const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Fields `create` and `modify` share. */
const editFlags = {
  dir: dirFlag,
  description: optionalString('description', 'One or two sentences saying when to use the skill.'),
  body: optionalString('body', 'Markdown body: `# When To Use`, `# Pipeline`, `# Reference`.'),
  author: optionalString('author', 'Maintainer name. Defaults to montflow.'),
  version: optionalString('version', 'SemVer version. Defaults to 1.0.0.'),
  license: optionalString('license', 'License name. Defaults to MIT.'),
  groups: optionalString('groups', 'Comma-separated group tags.'),
  dependencies: optionalString('dependencies', 'Comma-separated skill names to load first.'),
};

/** Where the store lives for this invocation. */
const scope = (dir: Option.Option<string>): Engines.StoreScope => ({
  cwd: process.cwd(),
  dir: opt(dir),
});

/**
 * Mark the process as failed without failing the handler.
 *
 * The house idiom (see `mf-specs`): print the report, then set
 * `process.exitCode`. Failing the handler instead would make `Command.run`
 * render its own error report on top of ours, so a caller would read the same
 * failure twice. `process.exitCode` rather than `process.exit` leaves buffered
 * stdout to flush when piped.
 */
const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

/**
 * Run an engine, printing either its rendered value or its refusal, and
 * setting a non-zero exit on the refusal.
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

const doctorCommand = Command.make(
  'doctor',
  { check: optionalBoolean('check', 'Report only; never write.'), verbose: verboseFlag },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Doctor.runDoctor(process.cwd(), {
        check: config.check,
        invocation: 'mf-skills doctor',
      });
      yield* Console.log(Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Install or verify the packaged skill-authoring skills.'));

const listCommand = Command.make('list', { dir: dirFlag, verbose: verboseFlag }, (config) =>
  report(Engines.list(scope(config.dir)), (skills) =>
    Renderers.list(skills, { verbose: config.verbose }),
  ),
).pipe(Command.withDescription('List stored skill names.'));

const showCommand = Command.make('show', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.load(scope(config.dir), config.name), Renderers.show),
).pipe(Command.withDescription('Print a skill raw SKILL.md.'));

const verifyCommand = Command.make(
  'verify',
  {
    dir: dirFlag,
    name: Argument.string('name').pipe(
      Argument.withDescription('Skill name; omit to verify every skill.'),
      Argument.optional,
    ),
    verbose: verboseFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.verify(scope(config.dir), opt(config.name));
      yield* Console.log(Renderers.verify(result, { verbose: config.verbose }));
      if (!result.valid) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Mechanically verify skill files. Non-zero when any fails.'));

const createCommand = Command.make(
  'create',
  {
    ...editFlags,
    name: nameArg,
    description: Flag.string('description').pipe(
      Flag.withDescription('One or two sentences saying when to use the skill.'),
    ),
  },
  (config) =>
    report(
      Engines.create(scope(config.dir), {
        name: config.name,
        description: config.description,
        body: opt(config.body) ?? '',
        author: opt(config.author),
        version: opt(config.version),
        license: opt(config.license),
        groups: csv(opt(config.groups)),
        dependencies: csv(opt(config.dependencies)),
      }),
      Renderers.created,
    ),
).pipe(Command.withDescription('Create a skill file from flags.'));

const modifyCommand = Command.make('modify', { ...editFlags, name: nameArg }, (config) =>
  report(
    Engines.modify(scope(config.dir), {
      name: config.name,
      description: opt(config.description),
      body: opt(config.body),
      author: opt(config.author),
      version: opt(config.version),
      license: opt(config.license),
      groups: Option.match(config.groups, {
        onNone: () => undefined,
        onSome: (value) => csv(value),
      }),
      dependencies: Option.match(config.dependencies, {
        onNone: () => undefined,
        onSome: (value) => csv(value),
      }),
    }),
    Renderers.saved,
  ),
).pipe(Command.withDescription('Update a skill file in place.'));

const deleteCommand = Command.make('delete', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.remove(scope(config.dir), config.name), () => Renderers.deleted(config.name)),
).pipe(Command.withDescription('Delete a skill directory.'));

/** The root command the binary runs. */
export const rootCommand = Command.make('mf-skills').pipe(
  Command.withDescription('Inspect, verify, and manage workspace skills in .agents/skills.'),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    showCommand,
    verifyCommand,
    createCommand,
    modifyCommand,
    deleteCommand,
  ]),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = '0.0.1';
