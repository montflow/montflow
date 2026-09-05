import { AgentRun } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { Cli, Interactive } from './apps/index.js';
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
 * exactly one prompt file, then stops. Transported as the preprompt.
 */
export const AUTHOR_PREPROMPT = `You are a prompt author for a pi coding agent.

Create exactly one new prompt file following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

The file is JSON with these fields:
- name: kebab-case file slug (also the file name)
- description: one line saying what the prompt does
- template: the prompt text with {{variable}} placeholders for user-supplied values
- variables: ordered list of variable names used in the template
- skills: list of skill names the run should load (empty when none)
- model: preferred model as provider/model-id, or '' when unset

Rules:
- Write the new prompt at .agents/@montflow/pi-prompts/<name>.json (choose a
  kebab-case <name> that fits the description), with all six fields present.
- Every {{token}} in the template must appear in variables, and vice versa.
- If a prompt with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/@montflow/pi-prompts/.`;

/**
 * Instructions after the user description: the reply shape.
 * Transported as the postprompt.
 */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the prompt name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named prompt file, then stops. Transported as the preprompt.
 */
export const MODIFY_PREPROMPT = `You are a prompt author for a pi coding agent.

Modify the single prompt file named in the request, keeping the JSON schema valid
(name, description, template, variables, skills, model), then stop. Do not ask
follow-up questions — work from the change as given.

Rules:
- Edit only the named file under .agents/@montflow/pi-prompts/.
- Keep every {{token}} in the template covered by variables, and vice versa.
- Do not rename the file. Do not touch anything else.`;

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
 * Pi extension entry: registers `/mf-prompts` (interactive, manual and
 * agentic) and `/mf-prompts-cli` (headless) with a file-backed store per
 * directory. The loader awaits the returned promise, so load failures
 * surface.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piPromptsExtension(pi: ExtensionAPI): Promise<void> {
  return Effect.gen(function* () {
    yield* Interactive.register(pi, Live, generateFor, modifyFor);
    yield* Cli.register(pi, Live);
  }).pipe(Effect.runPromise);
}
