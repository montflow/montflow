import { PiEffect } from '@montflow/pi-effect';
import { Dialogs, ModelOptions } from '@montflow/pi-interactive';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as PromptExecute from '../../modules/prompt-execute/index.js';
import * as Prompts from '../../modules/prompts/index.js';
import * as Doctor from '../doctor/index.js';
import { PromptStore } from '../../services/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-prompts-tui`). */
export const COMMAND_NAME = 'mf-prompts-tui';

/**
 * Help text shown for the command and the `help` action.
 *
 * Named `mf-prompts-tui` rather than `mf-prompts` so that the headless CLI
 * keeps the plain name: `mf-prompts` is the binary, and `/mf-prompts` is the
 * same command inside a Pi session. This one is the human-facing menu.
 */
export const COMMAND_DESCRIPTION =
  'Browse, create (manually or with an agent), show, inspect, modify (manually or with an agent), fill & render, or execute workspace prompts, or install the prompt skills (doctor). For the headless CLI use /mf-prompts.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-prompts-tui [browse | list | doctor | create [name] | show <name> | inspect <name> | modify [name] | render <name> [key=value ...] | execute <name> [key=value ...] | help]';

/**
 * Failure value when the user cancels a dialog. Shared with the other
 * `/mf-*` commands via `@montflow/pi-interactive`.
 */
export const CANCELLED = Dialogs.CANCELLED;

/** Minimal UI surface the flows need. Shared with the other `/mf-*` commands. */
export type InteractiveUi = Dialogs.InteractiveUi;

/** UI surface available where custom TUI components can render (TUI mode). */
export type FilterUi = Dialogs.FilterUi;

/** TUI model picker port. Shared with the other `/mf-*` commands. */
export type ModelPickerFn = Dialogs.ModelPickerFn;

/** Command environment: dialogs, cwd, resolved picker options, and TUI ports. */
export interface CommandEnv {
  readonly ui: InteractiveUi;
  readonly cwd: string;
  readonly models: ReadonlyArray<ModelOption>;
  readonly modelPicker: ModelPickerFn | undefined;
}

/** Parsed `/mf-prompts` invocation. */
export type Action =
  | { readonly kind: 'Menu' }
  | { readonly kind: 'Browse' }
  | { readonly kind: 'List' }
  | { readonly kind: 'Help' }
  | { readonly kind: 'Doctor' }
  | { readonly kind: 'Create'; readonly name: string | undefined }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Inspect'; readonly name: string; readonly values: Record<string, string> }
  | { readonly kind: 'Modify'; readonly name: string | undefined }
  | { readonly kind: 'Render'; readonly name: string; readonly values: Record<string, string> }
  | {
      readonly kind: 'Execute';
      readonly name: string;
      readonly values: Record<string, string>;
    };

/** Split args on whitespace. Shared with the other `/mf-*` commands. */
export const tokenize = Dialogs.tokenize;

/**
 * Collect `key=value` pairs from tokens. Supports bare `k=v`, `--set k=v`,
 * and `--set=k=v` (same convention as `/zi prompt`).
 * @param tokens - tokens after the action and name
 * @returns collected values by key
 */
export const collectValues = (tokens: readonly string[]) => {
  const values: Record<string, string> = {};
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (token === '--set') {
      const next = tokens[index + 1];
      if (next === undefined) continue;
      index++;
      const equals = next.indexOf('=');
      if (equals > 0) values[next.slice(0, equals)] = next.slice(equals + 1);
      continue;
    }
    const match = /^(?:--set=)?([^=\s]+)=(.*)$/.exec(token);
    if (match !== null) values[match[1] ?? ''] = match[2] ?? '';
  }
  return values;
};

/**
 * Parse raw slash-command args into an {@link Action}. Bare `/mf-prompts`
 * opens the menu; a lone unknown token is treated as `show <name>` shortcut.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseAction = (args: string): Action => {
  const tokens = tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Menu' };
  switch (head) {
    case 'browse':
      return { kind: 'Browse' };
    case 'list':
      return { kind: 'List' };
    case 'doctor':
      return { kind: 'Doctor' };
    case 'create':
      return { kind: 'Create', name: tokens[1] };
    case 'show':
      return tokens[1] === undefined ? { kind: 'Menu' } : { kind: 'Show', name: tokens[1] };
    case 'inspect':
      return tokens[1] === undefined
        ? { kind: 'Menu' }
        : { kind: 'Inspect', name: tokens[1], values: collectValues(tokens.slice(2)) };
    case 'execute':
      return tokens[1] === undefined
        ? { kind: 'Menu' }
        : { kind: 'Execute', name: tokens[1], values: collectValues(tokens.slice(2)) };
    case 'modify':
      return { kind: 'Modify', name: tokens[1] };
    case 'render':
      return tokens[1] === undefined
        ? { kind: 'Menu' }
        : { kind: 'Render', name: tokens[1], values: collectValues(tokens.slice(2)) };
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'Help' };
    default:
      return tokens.length === 1 ? { kind: 'Show', name: head } : { kind: 'Help' };
  }
};

/**
 * Unique `{{variable}}` names in first-appearance order. Delegates to the
 * prompts module so the interactive flows and the verifier agree on the
 * template's tokens.
 * @param template - prompt template with `{{variable}}` placeholders
 * @returns variable names
 */
export const variables = Prompts.templateVariables;

/**
 * Notify the prompt list, or a hint when empty.
 * @param ui - Pi ui dialogs
 * @param prompts - prompts to list
 * @returns Effect completing once notified
 */
export const listPrompts = (
  ui: InteractiveUi,
  prompts: readonly Prompts.Prompt[],
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (prompts.length === 0) {
      ui.notify('No prompts yet — create one with `/mf-prompts create <name>`.', 'info');
      return;
    }
    ui.notify(prompts.map((prompt) => `• ${prompt.name}`).join('\n'), 'info');
  });

/**
 * Notify a prompt's template, failing on unknown names.
 * @param ui - Pi ui dialogs
 * @param prompts - prompts to search
 * @param name - prompt name
 * @returns Effect completing once notified, failing on unknown names
 */
export const showPrompt = (
  ui: InteractiveUi,
  prompts: readonly Prompts.Prompt[],
  name: string,
): Effect.Effect<void, string> => {
  const prompt = prompts.find((candidate) => candidate.name === name);
  if (prompt === undefined) return Effect.fail(`Unknown prompt '${name}'.`);
  return Effect.sync(() => {
    ui.notify(
      prompt.template === '' ? `(prompt '${name}' has an empty template)` : prompt.template,
      'info',
    );
  });
};

/**
 * Notify a verify outcome: one line when valid, the full fix-oriented report
 * otherwise (issue, `Fix:` line, and the `variables` JSON to paste).
 * @param ui - Pi ui dialogs
 * @param name - verified prompt name
 * @param result - result from `Prompts.verifyPromptFile`
 * @returns Effect completing once notified
 */
export const notifyVerifyResult = (
  ui: InteractiveUi,
  name: string,
  result: Prompts.VerifyResult,
): Effect.Effect<void> => Effect.sync(() => ui.notify(Prompts.verifyReport(name, result), 'info'));

/** One model offered for agentic runs. Shared with the other `/mf-*` commands. */
export type ModelOption = Dialogs.ModelOption;

/** Agentic prompt generation port the consuming extension injects (child agent run). */
export interface GenerateInput {
  readonly description: string;
  readonly modelLabel: string | undefined;
}

export type PromptGenerator = (
  input: GenerateInput,
) => Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore>;

/** Agentic prompt modification port the consuming extension injects. */
export interface ModifyInput {
  readonly name: string;
  readonly change: string;
  readonly modelLabel: string | undefined;
}

export type PromptModifier = (
  input: ModifyInput,
) => Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore>;

/** Minimal model reference carried from the Pi context. Shared. */
export type ModelRef = ModelOptions.ModelRef;

/** Minimal model catalogue carried from the Pi context. Shared. */
export type ModelCatalog = ModelOptions.ModelCatalog;

/** Where the model picker reads from. Shared with the other `/mf-*` commands. */
export type ModelSource = ModelOptions.ModelSource;

/** Model picker options. Shared with the other `/mf-*` commands. */
export const modelOptions = ModelOptions.modelOptions;

/** Resolve picker options from the command source. Shared. */
export const resolveModelOptions = ModelOptions.resolveModelOptions;

/** Subsequence fuzzy match. Shared with the other `/mf-*` commands. */
export const matchesFilter = ModelOptions.matchesFilter;

/** Bottom menu entry opening the filter step. Shared. */
export const PICK_ANOTHER = ModelOptions.PICK_ANOTHER;

/** Model picker menu. Shared with the other `/mf-*` commands. */
export const pickModel = ModelOptions.pickModel;

/** Pick the authoring model for an agentic run. Shared. */
export const pickAgenticModel = ModelOptions.pickAgenticModel;

/**
 * Agentic create flow: describe the prompt, pick the authoring model
 * (current session model first), then run the injected generator.
 * Uses the injected TUI widget when provided, else the menu-driven
 * `pickModel`.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param generate - injected agentic generation port
 * @param modelPicker - TUI widget port, if available
 * @returns Effect resolving to the generated prompt, failing on cancel or agent errors
 */
export const createAgentic = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modelPicker?: ModelPickerFn | undefined,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const entered = yield* Effect.promise(() => ui.input('Describe the prompt'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const description = entered.trim();
    if (description === '') return yield* Effect.fail('Description must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Generating prompt');
    return yield* generate({ description, modelLabel });
  });

/**
 * Create flow entry: manual vs agentic choice, then the chosen flow.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param generate - injected agentic generation port
 * @param name - initial manual name, if already given
 * @returns Effect resolving to the new prompt, failing on cancel or agent errors
 */
export const createPrompt = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  name: string | undefined,
  modelPicker?: ModelPickerFn | undefined,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Create prompt', ['Create with agent', 'Create manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Create with agent')
      return yield* createAgentic(ui, models, generate, modelPicker);
    return yield* createManual(ui, name);
  });

/**
 * Manual create flow: name (when missing) then template via dialogs.
 * @param ui - Pi ui dialogs
 * @param name - initial name, if already given
 * @returns Effect resolving to the new descriptor, failing on cancel or blank input
 */
export const createManual = (
  ui: InteractiveUi,
  name: string | undefined,
): Effect.Effect<Prompts.Prompt, string> =>
  Effect.gen(function* () {
    let resolved = (name ?? '').trim();
    if (resolved === '') {
      const entered = yield* Effect.promise(() => ui.input('Prompt name', 'audit'));
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      resolved = entered.trim();
    }
    if (resolved === '') return yield* Effect.fail('Prompt name must not be empty.');
    const template = yield* Effect.promise(() => ui.input('Template', 'Audit {{files}}'));
    if (template === undefined) return yield* Effect.fail(CANCELLED);
    if (template.trim() === '') return yield* Effect.fail('Template must not be empty.');
    return Prompts.make(resolved, template);
  });

/**
 * Manual modify flow: enter a new template. Persists nothing itself — the
 * caller saves the returned descriptor.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt under edit
 * @returns Effect resolving to the updated descriptor, failing on cancel or blank input
 */
export const modifyManual = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
): Effect.Effect<Prompts.Prompt, string> =>
  Effect.gen(function* () {
    const template = yield* Effect.promise(() =>
      ui.input(`Template for '${prompt.name}'`, prompt.template),
    );
    if (template === undefined) return yield* Effect.fail(CANCELLED);
    if (template.trim() === '') return yield* Effect.fail('Template must not be empty.');
    return Prompts.Prompt.make({ ...prompt, template });
  });

/**
 * Agentic modify flow: describe the change, pick the authoring model
 * (current session model first), then run the injected modifier.
 * Uses the injected TUI widget when provided, else the menu-driven
 * `pickModel` — same picker as {@link createAgentic}.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt under edit
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param modelPicker - TUI widget port, if available
 * @returns Effect resolving to the updated prompt, failing on cancel or agent errors
 */
export const modifyAgentic = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
  models: ReadonlyArray<ModelOption>,
  modify: PromptModifier,
  modelPicker?: ModelPickerFn | undefined,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const entered = yield* Effect.promise(() => ui.input(`Change to '${prompt.name}'`));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const change = entered.trim();
    if (change === '') return yield* Effect.fail('Change must not be empty.');
    const modelLabel = yield* pickAgenticModel(ui, models, modelPicker, 'Updating prompt');
    return yield* modify({ name: prompt.name, change, modelLabel });
  });

/**
 * Modify flow entry: pick the prompt (when unnamed), choose manual vs
 * agentic, then run the chosen flow. Persists nothing itself.
 * @param ui - Pi ui dialogs
 * @param prompts - prompts to search
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @param name - prompt name, if already given
 * @returns Effect resolving to the updated descriptor, failing on cancel or unknown names
 */
export const modifyPrompt = (
  ui: InteractiveUi,
  prompts: readonly Prompts.Prompt[],
  models: ReadonlyArray<ModelOption>,
  modify: PromptModifier,
  name: string | undefined,
  modelPicker?: ModelPickerFn | undefined,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    let resolved = name;
    if (resolved === undefined) {
      if (prompts.length === 0) return yield* Effect.fail('No prompts yet — create one first.');
      const chosen = yield* Effect.promise(() =>
        ui.select(
          'Modify prompt',
          prompts.map((prompt) => prompt.name),
        ),
      );
      if (chosen === undefined) return yield* Effect.fail(CANCELLED);
      resolved = chosen;
    }
    const prompt = prompts.find((candidate) => candidate.name === resolved);
    if (prompt === undefined) return yield* Effect.fail(`Unknown prompt '${resolved}'.`);
    const mode = yield* Effect.promise(() =>
      ui.select('Modify prompt', ['Modify with agent', 'Modify manually']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Modify with agent')
      return yield* modifyAgentic(ui, prompt, models, modify, modelPicker);
    return yield* modifyManual(ui, prompt);
  });

/**
 * Render a prompt, prompting for each missing value via dialogs. Variables
 * that already have a value (supplied or defaulted) are not asked for, and an
 * optional variable may be left blank.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt descriptor
 * @param provided - values already collected (e.g. CLI `key=value` pairs)
 * @returns Effect resolving to the rendered template
 */
export const renderValues = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
  provided: Readonly<Record<string, string>>,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const collected = yield* fillInputs(ui, prompt, provided);
    return yield* Prompts.renderPrompt(prompt, collected);
  });

const findOrFail = (
  prompts: readonly Prompts.Prompt[],
  name: string,
): Effect.Effect<Prompts.Prompt, string> => {
  const prompt = prompts.find((candidate) => candidate.name === name);
  return prompt === undefined ? Effect.fail(`Unknown prompt '${name}'.`) : Effect.succeed(prompt);
};

/**
 * Collect values for every declared variable through numbered dialogs.
 *
 * Three rules, straight from the variable schema:
 *
 * - a variable with a `default` is never asked for when the value is blank —
 *   the default is the answer
 * - a `required` variable with no default must get a non-blank answer
 * - an optional variable with no default may be left blank, and renders as
 *   empty (which is what makes an `{{#if}}` guard take its `{{else}}` branch)
 *
 * Blank re-keeps the previous value, so a second pass can change one field
 * without retyping the rest.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt descriptor
 * @param initial - previously collected values (re-fill), if any
 * @returns Effect resolving to a complete value map
 */
export const fillInputs = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
  initial: Readonly<Record<string, string>>,
): Effect.Effect<Record<string, string>, string> =>
  Effect.gen(function* () {
    const declared = prompt.variables;
    const collected = { ...initial };
    let index = 0;
    for (const variable of declared) {
      const previous = collected[variable.name] ?? '';
      if (previous !== '' || variable.default !== '') continue;
      index++;
      const hint = variable.required === true ? 'required' : 'optional — leave blank to skip';
      const entered = yield* Effect.promise(() =>
        ui.input(
          `${variable.label} (${index} of ${declared.length})`,
          previous === '' ? hint : previous,
        ),
      );
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      if (entered === '' && variable.required === true) {
        return yield* Effect.fail(`Value for '${variable.name}' must not be empty.`);
      }
      collected[variable.name] = entered === '' ? previous : entered;
    }
    return collected;
  });

/**
 * Interactive execute: gate on doctor, fill the required values, pick a
 * model, then run.
 *
 * Order is deliberate. The doctor gate comes first, because a run started on
 * stale skill guidance is worse than no run — the agent will follow rules the
 * verifier no longer enforces. `fillInputs` comes before the model picker so
 * a cancel on a variable is cheap, and so the table shown afterwards already
 * reflects the answers.
 *
 * The model falls back to the prompt's own `model`; only a prompt that pins
 * none asks the user. `PromptExecute.execute` is then the authority on
 * whether the run may go ahead, so the TUI and the CLI cannot disagree.
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param prompt - prompt to run
 * @param models - picker options from {@link resolveModelOptions}
 * @param initial - values already supplied on the command line
 * @param execute - injected port that runs the agent
 * @param modelPicker - TUI model picker, if available
 * @returns Effect completing once the run settles
 */
export const executeFlow = (
  ui: InteractiveUi,
  cwd: string,
  prompt: Prompts.Prompt,
  models: ReadonlyArray<ModelOption>,
  initial: Readonly<Record<string, string>>,
  execute: PromptExecute.PromptExecutor,
  modelPicker?: ModelPickerFn | undefined,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const gate = yield* Doctor.runDoctor(cwd, { check: true });
    if (!gate.healthy) return yield* Effect.fail(Doctor.doctorGateMessage(gate));

    const values = yield* fillInputs(ui, prompt, initial);
    const model =
      prompt.model !== ''
        ? prompt.model
        : yield* pickAgenticModel(ui, models, modelPicker, 'Running prompt');
    if (model === undefined) return yield* Effect.fail(CANCELLED);

    const plan = PromptExecute.execute({ prompt, model, values });
    if (!plan.ok) return yield* Effect.fail(plan.message);

    const reply = yield* execute({
      cwd,
      name: prompt.name,
      model: plan.model,
      text: plan.text,
      skills: plan.skills,
    });
    yield* Effect.sync(() => ui.notify(reply, 'info'));
  });

/**
 * Structured render: fill every input, show the result, offer another pass
 * with the previous values as defaults.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt descriptor
 * @param initial - previously collected values (re-fill), if any
 * @returns Effect completing once the user declines another pass
 */
const renderLoop = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
  initial: Readonly<Record<string, string>>,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const values = yield* fillInputs(ui, prompt, initial);
    const rendered = yield* Prompts.renderPrompt(prompt, values);
    yield* Effect.sync(() => ui.notify(rendered, 'info'));
    const again = yield* Effect.promise(() =>
      ui.confirm('Render again?', 'Fill the inputs with different values.'),
    );
    if (again) return yield* renderLoop(ui, prompt, values);
  });

/**
 * Per-prompt submenu: show, render, modify, delete, or go back. After each
 * action (except delete) the submenu reopens; cancel goes back too.
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param models - picker options from resolveModelOptions
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @param execute - injected port that runs a resolved prompt
 * @param name - prompt under action
 * @returns Effect completing once the user goes back
 */
const promptMenu = (
  ui: InteractiveUi,
  cwd: string,
  name: string,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modify: PromptModifier,
  execute: PromptExecute.PromptExecutor,
  modelPicker: ModelPickerFn | undefined,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    // Suspended, not called: re-entering the menu must wait for the current
    // action to finish, not run ahead of it.
    const again = Effect.suspend(() =>
      promptMenu(ui, cwd, name, models, generate, modify, execute, modelPicker),
    );
    const chosen = yield* Effect.promise(() =>
      ui.select(`Prompt '${name}'`, [
        'Show',
        'Inspect',
        'Fill & render',
        'Execute',
        'Modify',
        'Delete',
        '← Back',
      ]),
    );
    if (chosen === undefined || chosen === '← Back') return;
    switch (chosen) {
      case 'Show': {
        const prompts = yield* store.list(cwd);
        yield* showPrompt(ui, prompts, name);
        return yield* again;
      }
      case 'Inspect': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, name);
        const summary = PromptExecute.inspect({ prompt });
        yield* Effect.sync(() => ui.notify(PromptExecute.table(summary), 'info'));
        return yield* again;
      }
      case 'Fill & render': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, name);
        yield* renderLoop(ui, prompt, {});
        return yield* again;
      }
      case 'Execute': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, name);
        yield* executeFlow(ui, cwd, prompt, models, {}, execute, modelPicker);
        return yield* again;
      }
      case 'Modify': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* modifyPrompt(ui, prompts, models, modify, name, modelPicker);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return yield* again;
      }
      case 'Delete': {
        const confirmed = yield* Effect.promise(() =>
          ui.confirm(`Delete prompt '${name}'?`, `'${name}.json' will be removed permanently.`),
        );
        if (!confirmed) return yield* again;
        yield* store.remove(cwd, name).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Deleted prompt '${name}'.`, 'info'));
        return;
      }
      default: {
        return yield* Effect.fail(`Unknown prompt action '${chosen}'.`);
      }
    }
  });

/**
 * Prompt browser: pick a prompt for its submenu, or go back. Re-lists after
 * every visit so creates, modifies, and deletes show immediately.
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param models - picker options from resolveModelOptions
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @returns Effect completing once the user goes back
 */
const browseMenu = (
  ui: InteractiveUi,
  cwd: string,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modify: PromptModifier,
  execute: PromptExecute.PromptExecutor,
  modelPicker: ModelPickerFn | undefined,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store.list(cwd);
    if (prompts.length === 0) {
      const chosen = yield* Effect.promise(() =>
        ui.select('No prompts yet', ['Create prompt', '← Back']),
      );
      if (chosen === 'Create prompt') {
        const prompt = yield* createPrompt(ui, models, generate, undefined, modelPicker);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return yield* browseMenu(ui, cwd, models, generate, modify, execute, modelPicker);
      }
      return;
    }
    const search = ui.searchSelect;
    const chosen = yield* Effect.promise(() =>
      search !== undefined
        ? search(
            'Prompts — pick one',
            prompts.map((prompt) => prompt.name),
          )
        : ui.select('Prompts — pick one', [...prompts.map((prompt) => prompt.name), '← Back']),
    );
    if (chosen === undefined || chosen === '← Back') return;
    if (prompts.every((prompt) => prompt.name !== chosen)) {
      return yield* Effect.fail(`Unknown prompt '${chosen}'.`);
    }
    yield* promptMenu(ui, cwd, chosen, models, generate, modify, execute, modelPicker);
    return yield* browseMenu(ui, cwd, models, generate, modify, execute, modelPicker);
  });

/**
 * Main menu loop: pick an area, run it, come back. Cancel exits silently.
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param models - picker options from resolveModelOptions
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @param execute - injected port that runs a resolved prompt
 * @returns Effect completing once the user exits
 */
const mainMenu = (
  ui: InteractiveUi,
  cwd: string,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modify: PromptModifier,
  execute: PromptExecute.PromptExecutor,
  modelPicker: ModelPickerFn | undefined,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const chosen = yield* Effect.promise(() =>
      ui.select('Prompts', ['Browse prompts', 'Create prompt', 'Exit']),
    );
    if (chosen === undefined || chosen === 'Exit') return;
    if (chosen === 'Create prompt') {
      const prompt = yield* createPrompt(ui, models, generate, undefined, modelPicker);
      yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
      yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
    } else if (chosen === 'Browse prompts') {
      yield* browseMenu(ui, cwd, models, generate, modify, execute, modelPicker);
    } else {
      return yield* Effect.fail(`Unknown menu choice '${chosen}'.`);
    }
    return yield* mainMenu(ui, cwd, models, generate, modify, execute, modelPicker);
  });

/**
 * Run one parsed args string end to end: parse, load, flow, save, notify.
 * @param args - raw slash-command args
 * @param env - command environment (dialogs, cwd, models)
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @param execute - injected port that runs a resolved prompt
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  env: CommandEnv,
  generate: PromptGenerator,
  modify: PromptModifier,
  execute: PromptExecute.PromptExecutor,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const ui = env.ui;
    const cwd = env.cwd;
    const models = env.models;
    const modelPicker = env.modelPicker;
    const action = parseAction(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'Doctor': {
        const result = yield* Doctor.runDoctor(cwd);
        yield* Effect.sync(() => ui.notify(Doctor.doctorMessage(result), 'info'));
        if (!result.healthy) return yield* Effect.fail(Doctor.doctorGateMessage(result));
        return;
      }
      case 'Browse': {
        yield* browseMenu(ui, cwd, models, generate, modify, execute, modelPicker);
        return;
      }
      case 'List': {
        yield* store.list(cwd).pipe(Effect.flatMap((prompts) => listPrompts(ui, prompts)));
        return;
      }
      case 'Create': {
        const prompt = yield* createPrompt(ui, models, generate, action.name, modelPicker);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return;
      }
      case 'Inspect': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        const summary = PromptExecute.inspect({ prompt, values: action.values });
        yield* Effect.sync(() => ui.notify(PromptExecute.table(summary), 'info'));
        return;
      }
      case 'Execute': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        yield* executeFlow(ui, cwd, prompt, models, action.values, execute, modelPicker);
        return;
      }
      case 'Show': {
        const prompts = yield* store.list(cwd);
        yield* showPrompt(ui, prompts, action.name);
        return;
      }
      case 'Modify': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* modifyPrompt(ui, prompts, models, modify, action.name, modelPicker);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return;
      }
      case 'Render': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        const rendered = yield* renderValues(ui, prompt, action.values);
        yield* Effect.sync(() => ui.notify(rendered, 'info'));
        return;
      }
      case 'Menu': {
        yield* mainMenu(ui, cwd, models, generate, modify, execute, modelPicker);
        return;
      }
    }
  });

/**
 * Register the `/mf-prompts` slash command as an Effect. Failures notify;
 * user cancellation notifies as info instead of an error.
 * @param api - Pi extension API
 * @param live - store layer provided to the handler at invocation
 * @param generateFor - agentic generation port for the command's working directory
 * @param modifyFor - agentic modification port for the command's working directory
 * @param executeFor - port that runs a resolved prompt for the working directory
 * @param searchFor - TUI filter picker factory, if available
 * @param modelPickerFor - TUI model picker factory, if available
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<PromptStore.PromptStore>,
  generateFor: (cwd: string) => PromptGenerator,
  modifyFor: (cwd: string) => PromptModifier,
  executeFor: (cwd: string) => PromptExecute.PromptExecutor,
  searchFor?: (ctx: {
    readonly ui: FilterUi;
    readonly mode: string;
  }) => InteractiveUi['searchSelect'],
  modelPickerFor?: (ctx: {
    readonly ui: FilterUi;
    readonly mode: string;
  }) => ModelPickerFn | undefined,
): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(
    api,
    COMMAND_NAME,
    COMMAND_DESCRIPTION,
    (args, ctx) => {
      const base = ctx.ui;
      let ui: InteractiveUi = {
        select: (title, options) => base.select(title, options),
        confirm: (title, message) => base.confirm(title, message),
        input: (title, placeholder) => base.input(title, placeholder),
        notify: (message, type) => base.notify(message, type),
      };
      const search = searchFor?.({ ui: ctx.ui, mode: ctx.mode });
      if (search !== undefined) ui = { ...ui, searchSelect: search };
      const modelPicker = modelPickerFor?.({ ui: ctx.ui, mode: ctx.mode });
      return run(
        args,
        {
          ui,
          cwd: ctx.cwd,
          models: resolveModelOptions(ctx),
          modelPicker,
        },
        generateFor(ctx.cwd),
        modifyFor(ctx.cwd),
        executeFor(ctx.cwd),
      ).pipe(Effect.provide(live));
    },
    (error) => (error === CANCELLED ? 'info' : 'error'),
  );
