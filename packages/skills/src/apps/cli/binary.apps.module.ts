import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import * as Doctor from '../doctor/index.js';
import * as Sync from '../sync/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import manifest from '../../../package.json' with { type: 'json' };

/**
 * The `mf-skills` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function, so
 * the binary and the `/mf-skills` slash command cannot disagree about
 * behaviour — the token contract lives in `renderers`, and `--verbose` is the
 * only thing this layer adds.
 */

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/**
 * The first value that is actually present. `--source=` is absent, so an empty
 * canonical flag falls through to its alias instead of shadowing it.
 */
const firstGiven = (...values: ReadonlyArray<string | undefined>): string | undefined =>
  values.find((value) => value !== undefined && value !== '');

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Store root override, on every store-touching command. */
const dirFlag = optionalString(
  'dir',
  'Workspace root containing .agents/skills. Defaults to the working directory.',
);

/** `sync` source: the checkout whose public skills are copied out. */
const sourceFlag = optionalString(
  'source',
  'Checkout to copy skills from. Defaults to the checkout this package runs from.',
);

/** `sync` source alias. */
const fromFlag = optionalString('from', 'Alias for --source.');

/** `sync` target: the workspace root that receives `.agents/skills`. */
const targetFlag = optionalString(
  'target',
  'Workspace root to write .agents/skills into. Defaults to the working directory.',
);

/** `sync` target alias. */
const targetAliasFlag = optionalString('dir', 'Alias for --target.');

/** `--verbose`: add per-item detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Show per-item detail. Default is token-lean.');

/** The `name` positional the single-skill commands take. */
const nameArg = Argument.String('name').pipe(
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
  {
    check: optionalBoolean('check', 'Report only; never write.'),
    dir: dirFlag,
    verbose: verboseFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const root = opt(config.dir) ?? process.cwd();
      const result = yield* Doctor.runDoctor(root, {
        check: config.check,
        invocation: 'mf-skills doctor',
      });
      yield* Console.log(Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Install or verify the packaged skill-authoring skills.'));

const listCommand = Command.make(
  'list',
  {
    dir: dirFlag,
    status: optionalString(
      'status',
      'Keep only skills whose file verifies (valid) or fails verification (invalid).',
    ),
    verbose: verboseFlag,
  },
  (config) =>
    report(
      Effect.gen(function* () {
        const status = yield* Engines.resolveListStatus(opt(config.status));
        return yield* Engines.list(scope(config.dir), { status });
      }),
      (skills) => Renderers.list(skills, { verbose: config.verbose, status: opt(config.status) }),
    ),
).pipe(Command.withDescription('List stored skill names.'));

const showCommand = Command.make('show', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.load(scope(config.dir), config.name), Renderers.show),
).pipe(Command.withDescription('Print a skill raw SKILL.md.'));

const verifyCommand = Command.make(
  'verify',
  {
    dir: dirFlag,
    name: Argument.String('name').pipe(
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
    description: Flag.String('description').pipe(
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

/**
 * `sync`: publish this checkout's public skills into a workspace store. The
 * engine owns classification, outcomes, and copying; this handler resolves the
 * two defaults and turns `--check` drift into a non-zero exit. `--source` and
 * `--target` are canonical; `--from` and `--dir` stay as aliases, and the
 * canonical flag wins when both are given.
 */
const syncCommand = Command.make(
  'sync',
  {
    source: sourceFlag,
    target: targetFlag,
    check: optionalBoolean(
      'check',
      'Report only; never write. Non-zero when the target is behind.',
    ),
    verbose: verboseFlag,
    from: fromFlag,
    dir: targetAliasFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Sync.runSync({
        from: firstGiven(opt(config.source), opt(config.from)),
        dir: firstGiven(opt(config.target), opt(config.dir)) ?? process.cwd(),
        check: config.check,
        cwd: process.cwd(),
        invocation: 'mf-skills sync',
      });
      yield* Console.log(Renderers.sync(result, { verbose: config.verbose }));
      if (result.check && result.drifted) {
        yield* Console.log(Renderers.syncRefusal(result));
        yield* exitFailed;
      }
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription('Copy a checkout public skills into a workspace .agents/skills store.'),
);

/** This package's root: three levels up from src/apps/cli. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

/** Identity embedded from this package's manifest. */
export const PACKAGE_IDENTITY = {
  name: manifest.name,
  version: manifest.version,
} satisfies BuildInfo.GeneratedIdentity;
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
    syncCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = '0.0.1';
