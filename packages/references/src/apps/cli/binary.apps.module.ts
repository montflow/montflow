import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import packageJson from '../../../package.json';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-references` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `engines` plus a renderer, so the binary
 * and the `/mf-references` slash command cannot disagree about behaviour. A
 * refusal sets `process.exitCode` inside the handler and never calls
 * `process.exit`, so buffered stdout is flushed.
 */

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Workspace-root override, on every command. */
const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');

/** `--human`: readable tables and prose. */
const humanFlag = optionalBoolean('human', 'Render readable tables and prose.');

/** `--verbose`: add detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Add detail to the same lines.');

/** Where the workspace root is for this invocation: `--dir` overrides the cwd. */
const scope = (dir: Option.Option<string>): Engines.StoreScope => ({
  cwd: process.cwd(),
  dir: opt(dir),
});

/** How this front end spells the actions, for the fix-it text it emits. */
const INVOCATION = 'mf-references';

/** Render modes from one command's boolean flags. */
const renderMode = (config: {
  readonly human: boolean;
  readonly verbose: boolean;
}): Renderers.RenderOptions => ({
  human: config.human,
  verbose: config.verbose,
});

/** Mark the process as failed without failing the handler. */
export const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

/** Print a usage refusal and mark the process failed. */
const usage = (message: string): Effect.Effect<void> =>
  Console.log(message).pipe(Effect.andThen(exitFailed));

/** Print an engine refusal and mark the process failed. */
const refuse = (message: string): Effect.Effect<void> =>
  Console.log(message).pipe(Effect.andThen(exitFailed));

/** Print an engine success or its refusal, setting a non-zero exit on failure. */
const report = <A, R>(
  self: Effect.Effect<A, string, R>,
  render: (value: A) => string,
): Effect.Effect<void, never, R> =>
  self.pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: (value) => Console.log(render(value)),
    }),
  );

/** Print text byte for byte: stdout only, never an added newline. */
export const writeRaw = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(text);
  });

/** Print a raw engine result or its refusal; bytes are never rewritten. */
const reportRaw = <R>(self: Effect.Effect<string, string, R>): Effect.Effect<void, never, R> =>
  self.pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: writeRaw,
    }),
  );

const doctorCommand = Command.make(
  'doctor',
  {
    check: optionalBoolean('check', 'Report only; write nothing. Non-zero when unhealthy.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const root = yield* Engines.rootOf(scope(config.dir));
      const result = yield* Engines.doctor(root, {
        check: config.check,
        invocation: INVOCATION,
      });
      yield* Console.log(Renderers.doctor(result, renderMode(config)));
      if (!result.healthy) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Verify the workspace scaffolding, registry, and packaged skills; repair what it can.',
  ),
);

const listCommand = Command.make(
  'list',
  {
    status: optionalString('status', 'Only installed or missing clones: installed|missing.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    report(
      Engines.list(scope(config.dir), { status: opt(config.status), invocation: INVOCATION }),
      (rows) => Renderers.list(rows, renderMode(config)),
    ),
).pipe(Command.withDescription('List every reference with its clone presence and purpose.'));

const showCommand = Command.make(
  'show',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Reference slug (the entry directory name).'),
    ),
    dir: dirFlag,
  },
  (config) => reportRaw(Engines.show(scope(config.dir), config.name, INVOCATION)),
).pipe(Command.withDescription('Print one entry’s REFERENCE.md bytes.'));

const verifyCommand = Command.make(
  'verify',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Reference slug. Omit to verify the whole store.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Verify every entry in the store.'),
    clones: optionalBoolean('clones', 'Also check local clones (CI-safe; never the network).'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const reportValue = yield* Engines.verify(scope(config.dir), {
        name: opt(config.name),
        all: config.all,
        clones: config.clones,
        invocation: INVOCATION,
      });
      yield* Console.log(Renderers.verify(reportValue, renderMode(config)));
      if (reportValue.issueCount > 0) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Verify committed store bytes, optionally with local clone state. Non-zero on any issue.',
  ),
);

const addCommand = Command.make(
  'add',
  {
    url: Argument.String('url').pipe(Argument.withDescription('https repository URL to clone.')),
    name: optionalString('name', 'Slug to register as. Defaults to the URL’s final segment.'),
    ref: optionalString('ref', 'Branch, tag, or commit pin.'),
    purpose: optionalString('purpose', 'One sentence explaining why the reference exists.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.add(scope(config.dir), config.url, {
        name: opt(config.name),
        ref: opt(config.ref),
        purpose: opt(config.purpose),
        invocation: INVOCATION,
      });
      yield* Console.log(Renderers.added(result, renderMode(config)));
      if (result.kind === 'refused' || result.kind === 'failed') yield* exitFailed;
      if (result.kind === 'routed' && Renderers.updateFailed(result.update)) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription('Register and clone one https URL. A registered URL routes to update.'),
);

const updateCommand = Command.make(
  'update',
  {
    target: Argument.String('target').pipe(
      Argument.withDescription('Reference slug or https URL. Omit when using --all.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Update every entry, sequentially in slug order.'),
    force: optionalBoolean('force', 'Discard local changes in a proven clone.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const target = opt(config.target);
      if (config.all && target !== undefined) {
        return yield* usage(`usage: pass either <name|url> or --all, not both`);
      }
      if (!config.all && target === undefined) {
        return yield* usage(
          `usage: ${INVOCATION} update <name|url> (or ${INVOCATION} update --all)`,
        );
      }
      if (config.all) {
        const reportValue = yield* Engines.updateAll(scope(config.dir), {
          force: config.force,
          invocation: INVOCATION,
        });
        yield* Console.log(Renderers.updatedAll(reportValue, renderMode(config)));
        if (reportValue.failed) yield* exitFailed;
        return;
      }
      if (target === undefined) return;
      const result = yield* Engines.update(scope(config.dir), target, {
        force: config.force,
        invocation: INVOCATION,
      });
      yield* Console.log(Renderers.updated(result, renderMode(config)));
      if (Renderers.updateFailed(result)) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(Command.withDescription('Refresh one entry, or --all, by name or URL.'));

const syncCommand = Command.make(
  'sync',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Reference slug. Omit when using --all.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Materialize or repair every entry.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.sync(scope(config.dir), {
        name: opt(config.name),
        all: config.all,
        invocation: INVOCATION,
      });
      if ('kind' in result) {
        return yield* refuse(result.message);
      }
      yield* Console.log(Renderers.synced(result, renderMode(config)));
      if (result.failed) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Materialize missing clones or repair local checkouts. Never writes the store.',
  ),
);

const statusCommand = Command.make(
  'status',
  {
    name: Argument.String('name').pipe(
      Argument.withDescription('Reference slug. Omit to report every entry.'),
      Argument.optional,
    ),
    fetch: optionalBoolean('fetch', 'Fetch origin first to report behind/ahead and moved tags.'),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.status(scope(config.dir), {
        name: opt(config.name),
        fetch: config.fetch,
        invocation: INVOCATION,
      });
      if ('kind' in result) {
        return yield* refuse(result.message);
      }
      yield* Console.log(Renderers.status(result, renderMode(config)));
      if (result.refused) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Report local clone state for one entry or every entry. Reports never gate.',
  ),
);

const removeCommand = Command.make(
  'remove',
  {
    name: Argument.String('name').pipe(Argument.withDescription('Reference slug to unregister.')),
    'keep-clone': optionalBoolean(
      'keep-clone',
      'Unregister the entry but keep its clone directory.',
    ),
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    report(
      Engines.remove(scope(config.dir), config.name, {
        keepClone: config['keep-clone'],
        invocation: INVOCATION,
      }),
      (result) => Renderers.removed(result, renderMode(config)),
    ),
).pipe(Command.withDescription('Unregister one entry and, unless --keep-clone, its clean clone.'));

/** The root command the binary runs. */
export const rootCommand = Command.make('mf-references').pipe(
  Command.withDescription(
    'Register, materialize, and verify third-party reference clones stored in .agents/@montflow/references.',
  ),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    showCommand,
    verifyCommand,
    addCommand,
    updateCommand,
    syncCommand,
    statusCommand,
    removeCommand,
  ]),
  Command.provide(Engines.Live),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = packageJson.version;
