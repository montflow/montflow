import { Console, Effect, Option } from 'effect';
import * as Argument from 'effect/unstable/cli/Argument';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';
import { PromptStore } from '../../services/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `mf-prompts` binary's command tree, built with `effect/unstable/cli`.
 *
 * Every handler is a one-liner over `engines` plus a renderer, so the binary
 * and the `/mf-prompts` slash command cannot disagree about behaviour — the
 * token contract lives in `renderers`, and `--verbose` is the only thing this
 * layer adds.
 *
 * `key=value` positionals are expressed with `Argument.variadic` and parsed by
 * the shared `engines.keyValues`, so both front ends take the same grammar.
 */

/**
 * Collapse an optional flag to `string | undefined`.
 *
 * `Flag.optional` yields an `Option`, and the distinction it carries is load
 * bearing: for `modify`, an absent `--description` must *keep* the stored
 * value, while an explicit `--description ""` must clear it. Flattening the
 * `Option` to `''` would make those two indistinguishable, so absent stays
 * `undefined` all the way into the engine.
 */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/** Optional string flag. */
const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Store directory override, on every store-touching command. */
const dirFlag = optionalString('dir', 'Store directory, resolved against the working directory.');

/** `--verbose`: add per-item detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Show per-item detail. Default is token-lean.');

/** The `name` positional every prompt command takes. */
const nameArg = Argument.string('name').pipe(
  Argument.withDescription('Prompt name (the file slug).'),
);

/** Trailing `key=value` positionals, shared with the slash command. */
const valuesArg = Argument.string('values').pipe(
  Argument.variadic,
  Argument.map(Engines.keyValues),
  Argument.withDescription('Variable values, as key=value pairs.'),
);

/** `--model` for `execute`; the prompt's own model applies when omitted. */
const modelFlag = optionalString(
  'model',
  'Model as provider/model-id. Defaults to the prompt own model.',
);

/** `--variable` for the editing commands; comma-separated specs allowed. */
const variableFlag = optionalString(
  'variable',
  'Variable spec: name, name:o (optional), name:d=<text> (default). Comma-separated.',
);

/** Fields `create` and `modify` share. */
const editFlags = {
  dir: dirFlag,
  description: optionalString('description', 'One-line summary.'),
  model: optionalString('model', 'Pinned model as provider/model-id.'),
  skills: optionalString('skills', 'Comma-separated skill names the run loads.'),
  variables: variableFlag,
};

/**
 * Run an engine, printing either its rendered value or its refusal, and
 * setting a non-zero exit on the refusal.
 *
 * Why not let the failure propagate and rely on `Command.run` to render it:
 * `Command.run` only renders `CliError.UserError`, and only when a
 * `CliOutput.Formatter` is installed — which `NodeServices.layer` alone does
 * not provide. Relying on it produced commands that **exited non-zero while
 * printing nothing**: the worst outcome for an agent, since a non-zero code
 * says "something is wrong" with no idea what. So each command prints its own
 * refusal, deterministically, and sets the exit code itself.
 */
const report = <A, R>(
  self: Effect.Effect<A, string, R>,
  render: (value: A) => string,
): Effect.Effect<void, never, R> =>
  self.pipe(
    // `matchEffect`, not `match`: the handlers print. `match` is the
    // non-effectful fold, and using it here ran neither branch.
    Effect.matchEffect({
      onFailure: (message) => Console.log(message).pipe(Effect.andThen(exitFailed)),
      onSuccess: (value) => Console.log(render(value)),
    }),
  );

/** How this front end spells the actions, for the fix-it text it emits. */
const BINARY_EXECUTE_INVOCATION = 'mf-prompts execute';
const BINARY_DOCTOR_INVOCATION = 'mf-prompts doctor';

/** Where the store lives for this invocation. */
const scope = (dir: Option.Option<string>): Engines.StoreScope => ({
  cwd: process.cwd(),
  dir: opt(dir),
});

/**
 * Mark the process as failed without failing the handler.
 *
 * The house idiom (see `mf-features`): print the report, then set
 * `process.exitCode`. Failing the handler instead would make `Command.run`
 * render its own error report on top of ours, so a caller would read the same
 * failure twice. `process.exitCode` rather than `process.exit` leaves buffered
 * stdout to flush, which matters when this is piped.
 */
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
    verbose: verboseFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.doctor(process.cwd(), config.check, BINARY_DOCTOR_INVOCATION);
      yield* Console.log(Renderers.doctor(result));
      if (!result.healthy) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Install or verify the packaged prompt skills.'));

const listCommand = Command.make('list', { dir: dirFlag, verbose: verboseFlag }, (config) =>
  report(Engines.list(scope(config.dir)), (prompts) =>
    Renderers.list(prompts, { verbose: config.verbose }),
  ),
).pipe(Command.withDescription('List stored prompt names.'));

const inspectCommand = Command.make(
  'inspect',
  { dir: dirFlag, name: nameArg, values: valuesArg },
  (config) =>
    report(Engines.inspect(scope(config.dir), config.name, config.values), (found) =>
      Renderers.inspect(found.summary),
    ),
).pipe(
  Command.withDescription(
    'Show a prompt: description, model, skills, and a table of every variable.',
  ),
);

const executeCommand = Command.make(
  'execute',
  { dir: dirFlag, model: modelFlag, name: nameArg, values: valuesArg },
  (config) =>
    Effect.gen(function* () {
      const resolved = yield* Engines.plan(
        {
          ...scope(config.dir),
          model: opt(config.model),
          values: config.values,
          invocation: BINARY_EXECUTE_INVOCATION,
          doctorInvocation: BINARY_DOCTOR_INVOCATION,
        },
        config.name,
      );
      // A blocked plan is a refusal, not a crash: print it and exit non-zero
      // through the same path every other refusal takes.
      if (!resolved.ok) {
        return yield* report(Effect.fail(resolved.message), (text: string) => text);
      }
      // The binary owns no child-agent runtime: running a prompt needs a
      // ModelRuntime, which lives in the Pi extension. So this validates and
      // renders end to end, then prints what would be sent — which is what
      // makes it useful outside a Pi session. To actually execute, use
      // `/mf-prompts execute` or the `prompt_execute` Pi tool.
      yield* Console.log(`Rendered for ${resolved.model}:\n\n${resolved.text}`);
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription(
    'Validate and render a prompt for execution. Prints the rendered text; use /mf-prompts execute or the prompt_execute tool to run it.',
  ),
);

const showCommand = Command.make('show', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.load(scope(config.dir), config.name), Renderers.show),
).pipe(Command.withDescription('Print a prompt raw template.'));

const verifyCommand = Command.make(
  'verify',
  { dir: dirFlag, name: nameArg, verbose: verboseFlag },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.verify(scope(config.dir), config.name);
      yield* Console.log(Renderers.verify(config.name, result, { verbose: config.verbose }));
      if (!result.valid) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(Command.withDescription('Mechanically verify a prompt file. Non-zero when it fails.'));

const renderCommand = Command.make(
  'render',
  { dir: dirFlag, name: nameArg, values: valuesArg },
  (config) => report(Engines.render(scope(config.dir), config.name, config.values), (text) => text),
).pipe(Command.withDescription('Render a prompt to text without running an agent.'));

const createCommand = Command.make(
  'create',
  {
    ...editFlags,
    name: nameArg,
    template: Flag.string('template').pipe(Flag.withDescription('Prompt text. Required.')),
  },
  (config) =>
    report(
      Engines.create({
        ...scope(config.dir),
        name: config.name,
        template: config.template,
        description: opt(config.description),
        model: opt(config.model),
        skills: Engines.variableFlag(opt(config.skills)),
        variables: Engines.variableFlag(opt(config.variables)),
      }),
      Renderers.created,
    ),
).pipe(Command.withDescription('Create a prompt file.'));

const modifyCommand = Command.make(
  'modify',
  {
    ...editFlags,
    name: nameArg,
    template: optionalString('template', 'Replacement prompt text. Omit to keep it.'),
  },
  (config) =>
    report(
      Engines.modify({
        ...scope(config.dir),
        name: config.name,
        template: opt(config.template),
        description: opt(config.description),
        model: opt(config.model),
        skills: Engines.variableFlag(opt(config.skills)),
        variables: Engines.variableFlag(opt(config.variables)),
      }),
      Renderers.saved,
    ),
).pipe(Command.withDescription('Update a prompt file in place.'));

const deleteCommand = Command.make('delete', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.remove(scope(config.dir), config.name), () => Renderers.deleted(config.name)),
).pipe(Command.withDescription('Delete a prompt file.'));

/** The root command the binary runs. */
export const rootCommand = Command.make('mf-prompts').pipe(
  Command.withDescription(
    'Inspect, verify, and execute reusable prompt templates stored in .agents/@montflow/pi-prompts.',
  ),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    inspectCommand,
    executeCommand,
    showCommand,
    verifyCommand,
    renderCommand,
    createCommand,
    modifyCommand,
    deleteCommand,
  ]),
  Command.provide(PromptStore.Default),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = '0.0.1';
