// Subpath imports, not the package root: the root re-exports `NodeClusterHttp`,
// which deep-imports `effect/dist/...`, and the OpenCode plugin loader refuses
// those specifiers. Subpaths pull only `effect/*` and node builtins.
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { defineTool, entry, type ServerPorts } from '@montflow/opencode';
import { Effect, Layer, Schema } from 'effect';
// The slash module, not the `apps/cli` barrel: the barrel also exports the
// binary, whose `effect/unstable/cli` import reaches `effect/dist/...`, which
// the OpenCode plugin loader refuses.
import * as Cli from './apps/cli/slash.apps.module.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- native child-run factory, not an Effect service; B002 §6 keeps dispatch out of a Layer.
import { makePromptExecutor } from './apps/server/index.js';
import * as PromptExecute from './modules/prompt-execute/index.js';
import * as Prompts from './modules/prompts/index.js';
import { PromptStore } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'prompts';

/** Slash command registered by the server plugin (invoke as `/mf-prompts`). */
export const COMMAND_NAME = Cli.COMMAND_NAME;

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION;

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<PromptStore.PromptStore> = Layer.provide(
  PromptStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/** Log a command result where the server host can see it. */
const notify = (message: string): void => {
  Effect.logInfo(message).pipe(Effect.runSync);
};

/** Load one prompt by name, failing with an agent-readable message. */
const loadPrompt = (cwd: string, name: string): Effect.Effect<Prompts.Prompt, string> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store.list(cwd);
    const found = prompts.find((candidate) => candidate.name === name);
    return found === undefined
      ? yield* Effect.fail(
          `Unknown prompt '${name}'. Run \`/mf-prompts list\` to see the available names.`,
        )
      : found;
  }).pipe(Effect.provide(Live));

/** The `prompt_inspect` tool: read-only summary of one prompt. */
const inspectTool = (cwd: string) =>
  defineTool({
    name: 'prompt_inspect',
    description:
      'Show a stored prompt: its description, model, skills, and a table of every variable with its type, whether it is required, its default, and its current value. Also names the required values that are still missing. Run this before executing a prompt so you know what to supply.',
    input: Schema.Struct({
      name: Schema.String,
      values: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const prompt = yield* loadPrompt(cwd, input.name);
        const summary = PromptExecute.inspect({ prompt, values: input.values });
        return PromptExecute.table(summary);
      }),
  });

/** The `prompt_execute` tool: dispatch a rendered prompt on a native session. */
const executeTool = (cwd: string, ports: ServerPorts) =>
  defineTool({
    name: 'prompt_execute',
    description:
      "Render a stored prompt with the given values and run it on the given model in a native session, returning the agent's last reply. Required by the prompt name; supply every variable listed as required by prompt_inspect. Fails with an actionable message when the model is missing or a required value was not supplied.",
    input: Schema.Struct({
      name: Schema.String,
      model: Schema.optional(Schema.String),
      values: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const prompt = yield* loadPrompt(cwd, input.name);
        const plan = PromptExecute.execute({
          prompt,
          model: input.model,
          values: input.values,
          invocation: '/mf-prompts execute',
        });
        if (!plan.ok) return yield* Effect.fail(plan.message);
        return yield* makePromptExecutor(ports)({
          cwd,
          name: prompt.name,
          model: plan.model,
          text: plan.text,
          skills: plan.skills,
        });
      }),
  });

/**
 * OpenCode server plugin entry: registers `/mf-prompts` and the
 * `prompt_inspect` / `prompt_execute` tools. Agentic authoring and editing
 * remain interactive concerns; their child runs use the same native
 * `ModelPort` + `SessionDispatchPort` path as `prompt_execute`.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    const executor = makePromptExecutor(ports);
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: (invocation) =>
        Cli.run(invocation.prompt.text, { notify }, ports.cwd, executor).pipe(
          Effect.provide(Live),
          Effect.catch((message) => Effect.sync(() => notify(message))),
        ),
    });
    yield* ports.tool.add(inspectTool(ports.cwd));
    yield* ports.tool.add(executeTool(ports.cwd, ports));
  }),
);
