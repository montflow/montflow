import { AgentRun } from '@montflow/pi-effect';
import { ModelPicker, PiInteractive } from '@montflow/pi-interactive';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { Type } from 'typebox';
import { Cli, Doctor, Interactive } from './apps/index.js';
import { PromptExecute, Prompts } from './modules/index.js';
import { PromptStore } from './services/index.js';

/** Node platform layers for the services the store needs. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/**
 * Full store layer: file-backed `PromptStore` with its platform
 * dependencies hidden. Handlers receive it via `register`.
 */
const Live = Layer.provide(PromptStore.Default, NodeLive);

/**
 * Instructions before the user description: the child agent authors
 * exactly one prompt file, then verifies it. Transported as the preprompt.
 *
 * The rules body is {@link Prompts.authoringRules}, the same constant the
 * workspace host and the packaged skills are written from, so the grammar
 * cannot drift from the verifier that enforces it.
 */
export const AUTHOR_PREPROMPT = `You are a prompt author for a pi coding agent.

Create exactly one new prompt file following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

${Prompts.authoringRules()}

Rules for this task:
- Write the new prompt at .agents/@montflow/pi-prompts/<name>.json (choose a
  kebab-case <name> that fits the description), with all six fields present.
  The file name must equal the name field plus '.json'.
- A variable that is only used to guard a branch with {{#if}} is still
  declared; declare it with "required": false and no "default" so leaving it
  blank takes the {{else}} branch.
- List .agents/skills/ and read each SKILL.md frontmatter 'name:' before
  listing a skill — reference existing skills only, otherwise leave skills
  empty.
- If a prompt with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/@montflow/pi-prompts/.

Before you finish, run \`/mf-prompts verify <name>\`. Fix every issue it
reports and run it again until it says the file matches the standard format.`;

/**
 * Instructions after the user description: the reply shape.
 * Transported as the postprompt.
 */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the prompt name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named prompt file, then verifies it. Transported as the preprompt.
 */
export const MODIFY_PREPROMPT = `You are a prompt author for a pi coding agent.

Modify the single prompt file named in the request, keeping the JSON schema valid
(name, description, template, variables, skills, model), then stop. Do not ask
follow-up questions — work from the change as given.

${Prompts.authoringRules()}

Rules for this task:
- Edit only the named file under .agents/@montflow/pi-prompts/.
- Do not rename the file and do not change the 'name' field. Do not touch
  anything else.
- Keep the file valid JSON (double quotes, no comments, no trailing commas).
- Reference existing skills only (check .agents/skills/ SKILL.md frontmatter
  'name:' values); drop unknown names instead of inventing them.

Before you finish, run \`/mf-prompts verify <name>\`. Fix every issue it
reports and run it again until it says the file matches the standard format.`;

/**
 * Instructions after the change request: the reply shape.
 * Transported as the postprompt.
 */
export const MODIFY_POSTPROMPT = 'When done, reply with one short line: what changed.';

/**
 * Shared model runtime for child agents: one per process. Provided to
 * every {@link AgentRun.runAgent} call by this extension.
 */
const AgentRuntimeLive = Layer.effect(
  AgentRun.AgentModelRuntime,
  Effect.promise(() =>
    import('@earendil-works/pi-coding-agent').then((pi) => pi.ModelRuntime.create()),
  ).pipe(Effect.mapError((error) => `Failed to start the model runtime: ${String(error)}`)),
);

/**
 * Agentic prompt generation for a working directory: runs the generic
 * {@link AgentRun.runAgent} with the prompt-authoring preprompt, then
 * loads the new file. New prompts are detected by name diff, so agent
 * chatter never parses.
 * @param cwd - project working directory
 * @returns generator port for the interactive flows
 */
const generateFor =
  (cwd: string): Interactive.PromptGenerator =>
  (input) =>
    Effect.gen(function* () {
      const store = yield* PromptStore.PromptStore;
      const before = yield* store.list(cwd);
      const beforeNames = new Set(before.map((prompt) => prompt.name));
      yield* AgentRun.runAgent({
        cwd,
        preprompt: AUTHOR_PREPROMPT,
        prompt: `Prompt description: ${input.description}`,
        postprompt: AUTHOR_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* store.list(cwd);
      const fresh = after.find((prompt) => !beforeNames.has(prompt.name));
      if (fresh === undefined) {
        return yield* Effect.fail(
          'The agent finished without creating a prompt — try describing it differently.',
        );
      }
      return fresh;
    });

/**
 * Agentic prompt modification for a working directory: runs the generic
 * {@link AgentRun.runAgent} with the prompt-editing preprompt, then
 * reloads the named file.
 * @param cwd - project working directory
 * @returns modifier port for the interactive flows
 */
const modifyFor =
  (cwd: string): Interactive.PromptModifier =>
  (input) =>
    Effect.gen(function* () {
      const store = yield* PromptStore.PromptStore;
      yield* AgentRun.runAgent({
        cwd,
        preprompt: MODIFY_PREPROMPT,
        prompt: `Prompt file: .agents/@montflow/pi-prompts/${input.name}.json\n\nChange: ${input.change}`,
        postprompt: MODIFY_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* store.list(cwd);
      const updated = after.find((prompt) => prompt.name === input.name);
      if (updated === undefined) {
        return yield* Effect.fail(
          'The agent finished without updating the prompt — try describing it differently.',
        );
      }
      return updated;
    });

/**
 * Prompt execution for a working directory: runs the generic
 * {@link AgentRun.runAgent} on the already-rendered text, with the prompt's
 * skills prepended as instructions.
 *
 * No preprompt or postprompt — the rendered text *is* the instruction, and
 * wrapping it would change what the user asked for. Every tool is allowed,
 * because a prompt is a task, not a file edit.
 * @param cwd - project working directory
 * @returns executor port for the CLI, TUI, and Pi tools
 */
const executeFor =
  (cwd: string): PromptExecute.PromptExecutor =>
  (request) => {
    const skills = request.skills
      .map((name) => `Load the '${name}' skill before starting.`)
      .join('\n');
    return AgentRun.runAgent({
      cwd,
      preprompt: skills,
      prompt: request.text,
      postprompt: '',
      modelLabel: request.model,
      tools: ['read', 'write', 'edit', 'bash', 'grep', 'glob'],
    }).pipe(
      Effect.mapError((error) => error.message),
      Effect.provide(AgentRuntimeLive),
    );
  };

/**
 * Tool result shape for rendered text an agent will read. `details` is
 * required by Pi's `AgentToolResult` and carries nothing here, so it stays an
 * empty object.
 */
const textResult = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  details: {},
});

/** `key=value` pairs, as the Pi tools accept them. */
const collectValues = (
  pairs: ReadonlyArray<readonly [string, string]> | undefined,
): Record<string, string> => Object.fromEntries(pairs ?? []);

/** Load one prompt by name from the store, failing with a usable message. */
const loadPrompt = (
  cwd: string,
  name: string,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store.list(cwd);
    const found = prompts.find((candidate) => candidate.name === name);
    return found === undefined
      ? yield* Effect.fail(
          `Unknown prompt '${name}'. Run \`/mf-prompts list\` to see the available names.`,
        )
      : found;
  });

/**
 * Pi extension entry: registers `/mf-prompts` (interactive, manual and
 * agentic), `/mf-prompts` (headless), and the agent-callable
 * `prompt_inspect` / `prompt_execute` tools, all against a file-backed store
 * per directory. The loader awaits the returned promise, so load failures
 * surface.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piPromptsExtension(pi: ExtensionAPI): Promise<void> {
  return Effect.gen(function* () {
    yield* Interactive.register(
      pi,
      Live,
      generateFor,
      modifyFor,
      executeFor,
      (ctx) =>
        ctx.mode === 'tui'
          ? (title, dialogOptions) =>
              PiInteractive.filterSelectDialog(ctx.ui, title, dialogOptions).pipe(Effect.runPromise)
          : undefined,
      (ctx) =>
        ctx.mode === 'tui'
          ? (models) => ModelPicker.modelPickerDialog(ctx.ui, models).pipe(Effect.runPromise)
          : undefined,
    );
    yield* Cli.register(pi, Live, executeFor);

    pi.registerTool({
      name: 'prompt_inspect',
      label: 'Inspect prompt',
      description:
        'Show a stored prompt: its description, model, skills, and a table of every variable with its type, whether it is required, its default, and its current value. Also names the required values that are still missing. Run this before executing a prompt so you know what to supply.',
      promptSnippet: 'prompt_inspect — inspect a stored prompt and its variables',
      parameters: Type.Object({
        name: Type.String({ description: 'Prompt name (the file slug).' }),
        values: Type.Optional(
          Type.Array(Type.Tuple([Type.String(), Type.String()]), {
            description: 'Values already collected, as [name, value] pairs.',
          }),
        ),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        Effect.gen(function* () {
          const prompt = yield* loadPrompt(ctx.cwd, params.name);
          const summary = PromptExecute.inspect({ prompt, values: collectValues(params.values) });
          return textResult(PromptExecute.table(summary));
        }).pipe(Effect.provide(Live), Effect.runPromise),
    });

    pi.registerTool({
      name: 'prompt_execute',
      label: 'Execute prompt',
      description:
        "Render a stored prompt with the given values and run it on the given model, returning the agent's reply. Required by the prompt name; supply every variable listed as required by prompt_inspect. Fails with an actionable message when the model is missing or a required value was not supplied. Checks that the prompt skills are installed and current first.",
      promptSnippet: 'prompt_execute — run a stored prompt on a model',
      parameters: Type.Object({
        name: Type.String({ description: 'Prompt name (the file slug).' }),
        model: Type.Optional(
          Type.String({
            description:
              "Model to run on, as provider/model-id. Omit when the prompt pins its own 'model'; execution fails with a fix-it message if neither supplies one.",
          }),
        ),
        values: Type.Optional(
          Type.Array(Type.Tuple([Type.String(), Type.String()]), {
            description:
              'Variable values, as [name, value] pairs. Every required variable needs one.',
          }),
        ),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
        Effect.gen(function* () {
          // Same gate as the CLI: never start a run on stale skill guidance.
          const gate = yield* Doctor.runDoctor(ctx.cwd, { check: true });
          if (!gate.healthy) return yield* Effect.fail(Doctor.doctorGateMessage(gate));
          const prompt = yield* loadPrompt(ctx.cwd, params.name);
          const plan = PromptExecute.execute({
            prompt,
            // Blank counts as absent, so a picker that hands back an empty
            // string still falls back to the prompt's own model.
            model: (params.model ?? '').trim() === '' ? undefined : params.model,
            values: collectValues(params.values),
          });
          if (!plan.ok) return yield* Effect.fail(plan.message);
          const reply = yield* executeFor(ctx.cwd)({
            cwd: ctx.cwd,
            name: prompt.name,
            model: plan.model,
            text: plan.text,
            skills: plan.skills,
          });
          return textResult(reply);
        }).pipe(Effect.provide(Live), Effect.runPromise),
    });
  }).pipe(Effect.runPromise);
}
