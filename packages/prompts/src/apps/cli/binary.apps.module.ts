import { Console, Effect, Layer, Option } from 'effect';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { ProfileStore } from '@montflow/profiles';
import { Argument, Command, Flag } from 'effect/cli';
import { PromptStore } from '../../services/index.js';
import * as Interactive from '../interactive/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import manifest from '../../../package.json' with { type: 'json' };
// oxlint-disable-next-line montflow/no-node-platform-imports -- the binary is the composition root; clipboard access shells out to an OS tool.
import { spawn, spawnSync } from 'node:child_process';

/** Node layers shared by the file-backed stores. */
const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/**
 * The `mf-prompts` binary's command tree, built with `effect/cli`.
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
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

/** Boolean flag, defaulting to false. */
const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

/** Workspace-root override, on every store-touching command. */
const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');

/** `--verbose`: add per-item detail without hiding anything. */
const verboseFlag = optionalBoolean('verbose', 'Show per-item detail. Default is token-lean.');

/** The `name` positional every prompt command takes. */
const nameArg = Argument.String('name').pipe(
  Argument.withDescription('Prompt name (the file slug).'),
);

/** Trailing `key=value` positionals, shared with the slash command. */
const valuesArg = Argument.String('values').pipe(
  Argument.variadic,
  Argument.map(Engines.keyValues),
  Argument.withDescription('Variable values, as key=value pairs.'),
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
const BINARY_CONSTRUCT_INVOCATION = 'mf-prompts construct';
const BINARY_DOCTOR_INVOCATION = 'mf-prompts doctor';

/** Where the workspace root is for this invocation: `--dir` overrides the cwd. */
const scope = (dir: Option.Option<string>): Engines.StoreScope => ({
  cwd: opt(dir) ?? process.cwd(),
});

/**
 * Mark the process as failed without failing the handler.
 *
 * The house idiom (see `mf-specs`): print the report, then set
 * `process.exitCode`. Failing the handler instead would make `Command.run`
 * render its own error report on top of ours, so a caller would read the same
 * failure twice. `process.exitCode` rather than `process.exit` leaves buffered
 * stdout to flush, which matters when this is piped.
 */
const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

/**
 * Interactive UI for `--wizard`, backed by the terminal through
 * `node:readline/promises`. Only reached in a real TTY (`process.stdout.isTTY`);
 * a non-TTY run refuses before any dialog opens.
 */
const consoleUi = () => {
  let rl: import('node:readline/promises').Interface | undefined;
  const line = (prompt: string): Promise<string | undefined> =>
    // oxlint-disable-next-line montflow/no-node-platform-imports -- the binary is the composition root; --wizard dialogs read the terminal.
    import('node:readline/promises').then(({ createInterface }) => {
      rl ??= createInterface({ input: process.stdin, output: process.stdout });
      return rl.question(`${prompt} `).catch(() => undefined);
    });
  const ui: Interactive.InteractiveUi = {
    select: async (title, options) => {
      process.stdout.write(`${title}\n`);
      options.forEach((option, index) => process.stdout.write(`  ${index + 1}) ${option}\n`));
      const answer = await line('Choice (number, Enter to cancel)');
      if (answer === undefined) return undefined;
      const index = Number.parseInt(answer, 10) - 1;
      return index >= 0 && index < options.length ? options[index] : undefined;
    },
    confirm: async (title, message) => {
      process.stdout.write(`${title} — ${message}\n`);
      const answer = await line('(y/n)');
      return answer?.trim().toLowerCase() === 'y';
    },
    input: async (title, placeholder) => {
      process.stdout.write(`${title}\n`);
      const answer = await line(placeholder ?? '');
      return answer;
    },
    notify: (message) => {
      process.stdout.write(`${message}\n`);
    },
  };
  return { ui, close: () => rl?.close() };
};

/**
 * Best-effort copy of text to the system clipboard, for `--copy`.
 *
 * The binary is the composition root, so touching platform tools is justified
 * here: clipboard access is OS-specific and this package has no clipboard
 * dependency, so it shells out to the platform tool (`pbcopy`, `xclip`, or
 * `wl-copy`). It never fails the command: the constructed output is already on
 * stdout, so an unavailable clipboard tool only means the copy step is skipped.
 */
const copyToClipboard = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    const tools: ReadonlyArray<[string, readonly string[]]> =
      process.platform === 'darwin'
        ? [['pbcopy', []]]
        : // oxlint-disable-next-line montflow/no-process-env -- picking a clipboard tool reads the display server once, at the composition root.
          process.env.WAYLAND_DISPLAY !== undefined
          ? [['wl-copy', ['--foreground', '--type', 'text/plain']]]
          : [
              ['xclip', ['-selection', 'clipboard']],
              ['xsel', ['--clipboard', '--input']],
            ];
    const available = tools.find(([tool]) => {
      try {
        const probe = spawnSync(tool, ['--version'], { stdio: 'ignore' });
        return probe.error === undefined;
      } catch {
        return false;
      }
    });
    if (available === undefined) return;
    const [tool, args] = available;
    spawn(tool, args, { stdio: ['pipe', 'ignore', 'ignore'] }).stdin?.end(text);
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
).pipe(Command.withDescription('Install or verify the packaged prompt skills.'));

const listCommand = Command.make(
  'list',
  {
    dir: dirFlag,
    status: optionalString(
      'status',
      'Keep only prompts whose file verifies (valid) or fails verification (invalid).',
    ),
    verbose: verboseFlag,
  },
  (config) =>
    report(
      Effect.gen(function* () {
        const status = yield* Engines.resolveListStatus(opt(config.status));
        return yield* Engines.list(scope(config.dir), { status });
      }),
      (prompts) => Renderers.list(prompts, { verbose: config.verbose, status: opt(config.status) }),
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

const constructCommand = Command.make(
  'construct',
  {
    dir: dirFlag,
    name: nameArg.pipe(Argument.optional),
    values: valuesArg,
    wizard: optionalBoolean('wizard', 'Collect the values interactively.'),
    copy: optionalBoolean('copy', 'Also place the constructed output on the system clipboard.'),
  },
  (config) =>
    Effect.gen(function* () {
      const root = opt(config.dir) ?? process.cwd();
      const name = opt(config.name);
      if (config.wizard) {
        // `--wizard` dispatches the shared interactive flow, which collects
        // every visible variable and renders through the same engine. Without
        // a TTY (e.g. a piped or CI run) it refuses with an actionable message
        // instead of hanging or emitting a partial prompt.
        const console = consoleUi();
        const text = yield* Interactive.constructWizard(console.ui, root, name, {
          interactive: process.stdout.isTTY === true,
        }).pipe(Effect.ensuring(Effect.sync(() => console.close())));
        yield* Console.log(text);
        if (config.copy) yield* copyToClipboard(text);
        return yield* Effect.void;
      }
      if (name === undefined) {
        return yield* report(
          Effect.fail(
            'construct requires a prompt name. Use: mf-prompts construct <name> [key=value ...], or add --wizard to pick one.',
          ),
          (text: string) => text,
        );
      }
      const text = yield* Engines.construct(scope(config.dir), name, config.values, {
        invocation: BINARY_CONSTRUCT_INVOCATION,
      });
      yield* Console.log(text);
      if (config.copy) yield* copyToClipboard(text);
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription(
    'Validate, fill, and render a prompt to its final text. Requires no model. Use --wizard to collect values interactively, or --copy to copy the output to the clipboard.',
  ),
);

const showCommand = Command.make('show', { dir: dirFlag, name: nameArg }, (config) =>
  report(Engines.load(scope(config.dir), config.name), Renderers.show),
).pipe(Command.withDescription('Print a prompt raw template.'));

const verifyCommand = Command.make(
  'verify',
  {
    dir: dirFlag,
    name: Argument.String('name').pipe(
      Argument.withDescription('Prompt name. Omit to verify every prompt.'),
      Argument.optional,
    ),
    all: optionalBoolean('all', 'Verify every prompt in the store.'),
    verbose: verboseFlag,
    strict: optionalBoolean(
      'strict',
      'Treat unresolved skill references as errors instead of warnings.',
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const name = opt(config.name);
      if (config.all || name === undefined) {
        const all = yield* Engines.verifyAll(scope(config.dir), { strict: config.strict });
        yield* Console.log(Renderers.verifyAll(all, { verbose: config.verbose }));
        // Warnings do not fail: only an issue that produced `valid: false` does.
        if (all.entries.some((entry) => !entry.result.valid)) yield* exitFailed;
        return yield* Effect.void;
      }
      const result = yield* Engines.verify(scope(config.dir), name, { strict: config.strict });
      yield* Console.log(Renderers.verify(name, result, { verbose: config.verbose }));
      if (!result.valid) yield* exitFailed;
      return yield* Effect.void;
    }).pipe(Effect.catch((message) => Console.log(message).pipe(Effect.andThen(exitFailed)))),
).pipe(
  Command.withDescription('Mechanically verify one or every prompt file. Non-zero when any fails.'),
);

const createCommand = Command.make(
  'create',
  {
    ...editFlags,
    name: nameArg,
    template: Flag.String('template').pipe(Flag.withDescription('Prompt text. Required.')),
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

/** This package's root: three levels up from src/apps/cli. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

/** Identity embedded from this package's manifest. */
export const PACKAGE_IDENTITY = {
  name: manifest.name,
  version: manifest.version,
} satisfies BuildInfo.GeneratedIdentity;
/** The root command the binary runs. */
export const rootCommand = Command.make('mf-prompts').pipe(
  Command.withDescription(
    'Inspect, verify, and construct reusable prompt templates stored in .agents/@montflow/prompts.',
  ),
  Command.withSubcommands([
    doctorCommand,
    listCommand,
    inspectCommand,
    constructCommand,
    showCommand,
    verifyCommand,
    createCommand,
    modifyCommand,
    deleteCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
  Command.provide(
    Layer.mergeAll(
      Layer.provide(PromptStore.Default, NodeLive),
      Layer.provide(ProfileStore.Default, NodeLive),
    ),
  ),
);

/** Version reported by `--version`. Mirrors the package version. */
export const VERSION = '0.0.1';
