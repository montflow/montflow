import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI, ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';
import { PromptStore } from '../../services/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-prompts`). */
export const COMMAND_NAME = 'mf-prompts';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Browse, create (manually or with an agent), show, modify (manually or with an agent), fill & render workspace prompts.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-prompts [browse | list | create [name] | show <name> | modify [name] | render <name> [key=value ...] | help]';

/** Failure value when the user cancels a dialog. Notified as info, not an error. */
export const CANCELLED = 'Cancelled.';

/**
 * Minimal UI surface the flows need. Mirrors Pi's own narrowing for dialogs,
 * so any real `ctx.ui` is assignable and fakes stay tiny.
 */
export interface InteractiveUi {
  readonly select: (title: string, options: string[]) => Promise<string | undefined>;
  readonly confirm: (title: string, message: string) => Promise<boolean>;
  readonly input: (title: string, placeholder?: string) => Promise<string | undefined>;
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
  /** Live filter-as-you-type picker. Absent outside the TUI (falls back to input+select). */
  readonly searchSelect?: (title: string, options: string[]) => Promise<string | undefined>;
}

/** UI surface available where custom TUI components can render (TUI mode). */
export interface FilterUi extends InteractiveUi {
  readonly custom: ExtensionUIContext['custom'];
}

/**
 * TUI model picker port the consuming extension injects (search UI with the
 * current session model pinned). Absent outside the TUI (falls back to the
 * menu-driven `pickModel`).
 */
export type ModelPickerFn = (models: ReadonlyArray<ModelOption>) => Promise<string | undefined>;

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
  | { readonly kind: 'Create'; readonly name: string | undefined }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Modify'; readonly name: string | undefined }
  | { readonly kind: 'Render'; readonly name: string; readonly values: Record<string, string> };

/**
 * Split args on whitespace, keeping `"quoted spans"` together (quotes stripped).
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of args.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token !== '');
};

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
    case 'create':
      return { kind: 'Create', name: tokens[1] };
    case 'show':
      return tokens[1] === undefined ? { kind: 'Menu' } : { kind: 'Show', name: tokens[1] };
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
 * Unique `{{variable}}` names in first-appearance order.
 * @param template - prompt template with `{{variable}}` placeholders
 * @returns variable names
 */
export const variables = (template: string): readonly string[] => {
  const seen = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const name = (match[1] ?? '').trim();
    if (name !== '') seen.add(name);
  }
  return [...seen];
};

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

/** One model offered for agentic runs: `provider/model-id` plus current-run marker. */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

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

/** Minimal model reference carried from the Pi context (provider + id only). */
export interface ModelRef {
  readonly provider: string;
  readonly id: string;
}

/** Minimal model catalogue carried from the Pi context. */
export interface ModelCatalog {
  readonly getAvailable: () => ReadonlyArray<ModelRef>;
}

/** Where the model picker reads from: current, scoped, catalogue fallback. */
export interface ModelSource {
  readonly model: ModelRef | undefined;
  readonly scopedModels: ReadonlyArray<{ readonly model: ModelRef }>;
  readonly modelRegistry: ModelCatalog;
}

/**
 * Model picker options: the current session model first (marked), then
 * scoped models, deduplicated by label. Pure constructors for tests.
 * @param current - current session model, if any
 * @param catalog - other models (scoped or full catalogue)
 * @returns picker options, possibly empty
 */
export const modelOptions = (
  current: ModelRef | undefined,
  catalog: ReadonlyArray<ModelRef>,
): ReadonlyArray<ModelOption> => {
  const options: Array<ModelOption> = [];
  const seen = new Set<string>();
  const push = (provider: string, id: string, isCurrent: boolean): void => {
    const label = `${provider}/${id}`;
    if (seen.has(label)) return;
    seen.add(label);
    options.push({ label, current: isCurrent });
  };
  if (current !== undefined) push(current.provider, current.id, true);
  for (const entry of catalog) push(entry.provider, entry.id, false);
  return options;
};

/**
 * Resolve picker options from the command source: scoped models when the
 * session scopes them, otherwise the live catalogue (models with usable
 * auth). Pure and total — catalogue reads are sync snapshots.
 * @param source - model source from the Pi context
 * @returns picker options, possibly empty
 */
export const resolveModelOptions = (source: ModelSource): ReadonlyArray<ModelOption> => {
  if (source.scopedModels.length > 0) {
    return modelOptions(
      source.model,
      source.scopedModels.map((scoped) => scoped.model),
    );
  }
  return modelOptions(source.model, source.modelRegistry.getAvailable());
};

/**
 * Subsequence fuzzy match: every query character appears in the label in
 * order (not necessarily consecutive). Case-insensitive.
 * @param label - model label to test
 * @param query - user filter text
 * @returns true when the label matches
 */
export const matchesFilter = (label: string, query: string): boolean => {
  const haystack = label.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  let position = 0;
  for (const char of needle) {
    position = haystack.indexOf(char, position);
    if (position === -1) return false;
    position++;
  }
  return true;
};

/** Display label with the current-run marker. */
const displayModel = (option: ModelOption): string =>
  option.current ? `${option.label} (current)` : option.label;

/** Bottom menu entry opening the filter step. */
export const PICK_ANOTHER = 'Pick another model…';

/**
 * Map a picked display label back to its model label.
 * @param models - picker options
 * @param picked - display label from a dialog
 * @returns Effect resolving to the model label, failing on unknown picks
 */
const modelLabelFor = (
  models: ReadonlyArray<ModelOption>,
  picked: string,
): Effect.Effect<string, string> => {
  const match = models.find((option) => displayModel(option) === picked || option.label === picked);
  if (match === undefined) return Effect.fail(`Unknown model ${picked}.`);
  return Effect.succeed(match.label);
};

/**
 * Model picker menu: the current model first and a bottom
 * `Pick another model…` entry. The filter step uses the live
 * search dialog when provided, else input-then-select.
 * Non-TUI path — the TUI uses the injected `ModelPickerFn` widget instead.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @returns Effect resolving to the picked label, failing on cancel or no match
 */
export const pickModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    const first = yield* Effect.promise(() =>
      ui.select('Model for the authoring run', [...models.map(displayModel), PICK_ANOTHER]),
    );
    if (first === undefined) return yield* Effect.fail(CANCELLED);
    if (first !== PICK_ANOTHER) return yield* modelLabelFor(models, first);
    const search = ui.searchSelect;
    if (search !== undefined) {
      const picked = yield* Effect.promise(() => search('Filter models', models.map(displayModel)));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      return yield* modelLabelFor(models, picked);
    }
    const entered = yield* Effect.promise(() => ui.input('Filter models', 'sonnet'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const query = entered.trim();
    const candidates =
      query === '' ? models : models.filter((option) => matchesFilter(option.label, query));
    if (candidates.length === 0) return yield* Effect.fail(`No models match ${query}.`);
    const picked = yield* Effect.promise(() =>
      ui.select('Model for the authoring run', candidates.map(displayModel)),
    );
    if (picked === undefined) return yield* Effect.fail(CANCELLED);
    return yield* modelLabelFor(candidates, picked);
  });

/**
 * Pick the authoring model for an agentic run: session model when the
 * catalogue is empty, the injected TUI widget when provided (current
 * session model pinned first, single-keystroke keep), else the
 * menu-driven `pickModel`. Notifies the chosen runtime.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param modelPicker - TUI widget port, if available
 * @param verb - progress verb phrase (e.g. `Generating prompt`)
 * @returns Effect resolving to the picked label (undefined = session model)
 */
export const pickAgenticModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  modelPicker: ModelPickerFn | undefined,
  verb: string,
): Effect.Effect<string | undefined, string> =>
  Effect.gen(function* () {
    if (models.length === 0) {
      yield* Effect.sync(() => ui.notify(`${verb} with the session model…`, 'info'));
      return undefined;
    }
    if (modelPicker !== undefined) {
      const picked = yield* Effect.promise(() => modelPicker(models));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      yield* Effect.sync(() => ui.notify(`${verb} with ${picked}…`, 'info'));
      return picked;
    }
    const picked = yield* pickModel(ui, models);
    yield* Effect.sync(() => ui.notify(`${verb} with ${picked}…`, 'info'));
    return picked;
  });

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
 * Render a prompt, prompting for each missing variable via dialogs.
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
    const collected = { ...provided };
    for (const name of variables(prompt.template)) {
      if (collected[name] !== undefined && collected[name] !== '') continue;
      const entered = yield* Effect.promise(() => ui.input(`Value for ${name}`));
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      collected[name] = entered;
    }
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
 * Collect every template variable through numbered dialogs. Blank keeps the
 * previous value when re-filling; blank with no previous value fails so the
 * result never carries unfilled tokens.
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
    const names = variables(prompt.template);
    const collected = { ...initial };
    let index = 0;
    for (const name of names) {
      index++;
      const previous = collected[name] ?? '';
      const entered = yield* Effect.promise(() =>
        ui.input(
          `Value for '${name}' (${index} of ${names.length})`,
          previous === '' ? 'required' : previous,
        ),
      );
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      if (entered === '' && previous === '') {
        return yield* Effect.fail(`Value for '${name}' must not be empty.`);
      }
      collected[name] = entered === '' ? previous : entered;
    }
    return collected;
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
  modelPicker: ModelPickerFn | undefined,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const chosen = yield* Effect.promise(() =>
      ui.select(`Prompt '${name}'`, ['Show', 'Fill & render', 'Modify', 'Delete', '← Back']),
    );
    if (chosen === undefined || chosen === '← Back') return;
    switch (chosen) {
      case 'Show': {
        const prompts = yield* store.list(cwd);
        yield* showPrompt(ui, prompts, name);
        return yield* promptMenu(ui, cwd, name, models, generate, modify, modelPicker);
      }
      case 'Fill & render': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, name);
        yield* renderLoop(ui, prompt, {});
        return yield* promptMenu(ui, cwd, name, models, generate, modify, modelPicker);
      }
      case 'Modify': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* modifyPrompt(ui, prompts, models, modify, name, modelPicker);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return yield* promptMenu(ui, cwd, name, models, generate, modify, modelPicker);
      }
      case 'Delete': {
        const confirmed = yield* Effect.promise(() =>
          ui.confirm(`Delete prompt '${name}'?`, `'${name}.json' will be removed permanently.`),
        );
        if (!confirmed)
          return yield* promptMenu(ui, cwd, name, models, generate, modify, modelPicker);
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
        return yield* browseMenu(ui, cwd, models, generate, modify, modelPicker);
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
    yield* promptMenu(ui, cwd, chosen, models, generate, modify, modelPicker);
    return yield* browseMenu(ui, cwd, models, generate, modify, modelPicker);
  });

/**
 * Main menu loop: pick an area, run it, come back. Cancel exits silently.
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param models - picker options from resolveModelOptions
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @returns Effect completing once the user exits
 */
const mainMenu = (
  ui: InteractiveUi,
  cwd: string,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modify: PromptModifier,
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
      yield* browseMenu(ui, cwd, models, generate, modify, modelPicker);
    } else {
      return yield* Effect.fail(`Unknown menu choice '${chosen}'.`);
    }
    return yield* mainMenu(ui, cwd, models, generate, modify, modelPicker);
  });

/**
 * Run one parsed args string end to end: parse, load, flow, save, notify.
 * @param args - raw slash-command args
 * @param env - command environment (dialogs, cwd, models)
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  env: CommandEnv,
  generate: PromptGenerator,
  modify: PromptModifier,
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
      case 'Browse': {
        yield* browseMenu(ui, cwd, models, generate, modify, modelPicker);
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
        yield* mainMenu(ui, cwd, models, generate, modify, modelPicker);
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
 * @param searchFor - TUI filter picker factory, if available
 * @param modelPickerFor - TUI model picker factory, if available
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<PromptStore.PromptStore>,
  generateFor: (cwd: string) => PromptGenerator,
  modifyFor: (cwd: string) => PromptModifier,
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
      ).pipe(Effect.provide(live));
    },
    (error) => (error === CANCELLED ? 'info' : 'error'),
  );
