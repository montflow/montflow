import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';
import { PromptStore } from '../../services/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-prompts`). */
export const COMMAND_NAME = 'mf-prompts';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Manage prompt templates interactively: list, create, show, modify, or render a prompt.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-prompts [list | create [name] | show <name> | modify [name] | render <name> [key=value ...] | help]';

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
}

/** Parsed `/mf-prompts` invocation. */
export type Action =
  | { readonly kind: 'Menu' }
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

/**
 * Model picker: filter input for long lists, then select. The current
 * session model stays first so Enter-picking stays one step.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @returns Effect resolving to the picked label, failing on cancel or no match
 */
export const pickModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    let candidates = models;
    if (models.length > 6) {
      const entered = yield* Effect.promise(() => ui.input('Filter models', 'sonnet'));
      if (entered === undefined) return yield* Effect.fail(CANCELLED);
      const query = entered.trim();
      if (query !== '') {
        candidates = models.filter((option) => matchesFilter(option.label, query));
        if (candidates.length === 0) return yield* Effect.fail(`No models match '${query}'.`);
      }
    }
    const picked = yield* Effect.promise(() =>
      ui.select('Model for the authoring run', candidates.map(displayModel)),
    );
    if (picked === undefined) return yield* Effect.fail(CANCELLED);
    const match = candidates.find((option) => displayModel(option) === picked);
    if (match === undefined) return yield* Effect.fail(`Unknown model '${picked}'.`);
    return match.label;
  });

/**
 * Agentic create flow: describe the prompt, pick the authoring model
 * (current session model first), then run the injected generator.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param generate - injected agentic generation port
 * @returns Effect resolving to the generated prompt, failing on cancel or agent errors
 */
export const createAgentic = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const entered = yield* Effect.promise(() => ui.input('Describe the prompt'));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const description = entered.trim();
    if (description === '') return yield* Effect.fail('Description must not be empty.');
    let modelLabel: string | undefined;
    if (models.length > 0) {
      modelLabel = yield* pickModel(ui, models);
      yield* Effect.sync(() => ui.notify(`Generating prompt with ${modelLabel}…`, 'info'));
    } else {
      yield* Effect.sync(() => ui.notify('Generating prompt with the session model…', 'info'));
    }
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
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const mode = yield* Effect.promise(() =>
      ui.select('Create prompt', ['Create manually', 'Create with agent']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Create with agent') return yield* createAgentic(ui, models, generate);
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
 * Agentic modify flow: describe the change, pick the authoring model, then
 * run the injected modifier.
 * @param ui - Pi ui dialogs
 * @param prompt - prompt under edit
 * @param models - picker options from {@link resolveModelOptions}
 * @param modify - injected agentic modification port
 * @returns Effect resolving to the updated prompt, failing on cancel or agent errors
 */
export const modifyAgentic = (
  ui: InteractiveUi,
  prompt: Prompts.Prompt,
  models: ReadonlyArray<ModelOption>,
  modify: PromptModifier,
): Effect.Effect<Prompts.Prompt, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const entered = yield* Effect.promise(() => ui.input(`Change to '${prompt.name}'`));
    if (entered === undefined) return yield* Effect.fail(CANCELLED);
    const change = entered.trim();
    if (change === '') return yield* Effect.fail('Change must not be empty.');
    let modelLabel: string | undefined;
    if (models.length > 0) {
      modelLabel = yield* pickModel(ui, models);
      yield* Effect.sync(() => ui.notify(`Updating prompt with ${modelLabel}…`, 'info'));
    } else {
      yield* Effect.sync(() => ui.notify('Updating prompt with the session model…', 'info'));
    }
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
      ui.select('Modify prompt', ['Modify manually', 'Modify with agent']),
    );
    if (mode === undefined) return yield* Effect.fail(CANCELLED);
    if (mode === 'Modify with agent') return yield* modifyAgentic(ui, prompt, models, modify);
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
        return yield* promptMenu(ui, cwd, name, models, generate, modify);
      }
      case 'Fill & render': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, name);
        yield* renderLoop(ui, prompt, {});
        return yield* promptMenu(ui, cwd, name, models, generate, modify);
      }
      case 'Modify': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* modifyPrompt(ui, prompts, models, modify, name);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return yield* promptMenu(ui, cwd, name, models, generate, modify);
      }
      case 'Delete': {
        const confirmed = yield* Effect.promise(() =>
          ui.confirm(`Delete prompt '${name}'?`, `'${name}.json' will be removed permanently.`),
        );
        if (!confirmed) return yield* promptMenu(ui, cwd, name, models, generate, modify);
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
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const prompts = yield* store.list(cwd);
    if (prompts.length === 0) {
      const chosen = yield* Effect.promise(() =>
        ui.select('No prompts yet', ['Create prompt', '← Back']),
      );
      if (chosen === 'Create prompt') {
        const prompt = yield* createPrompt(ui, models, generate, undefined);
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return yield* browseMenu(ui, cwd, models, generate, modify);
      }
      return;
    }
    const chosen = yield* Effect.promise(() =>
      ui.select('Prompts — pick one', [...prompts.map((prompt) => prompt.name), '← Back']),
    );
    if (chosen === undefined || chosen === '← Back') return;
    if (prompts.every((prompt) => prompt.name !== chosen)) {
      return yield* Effect.fail(`Unknown prompt '${chosen}'.`);
    }
    yield* promptMenu(ui, cwd, chosen, models, generate, modify);
    return yield* browseMenu(ui, cwd, models, generate, modify);
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
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const chosen = yield* Effect.promise(() =>
      ui.select('Prompts', ['Browse prompts', 'Create prompt', 'Exit']),
    );
    if (chosen === undefined || chosen === 'Exit') return;
    if (chosen === 'Create prompt') {
      const prompt = yield* createPrompt(ui, models, generate, undefined);
      yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
      yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
    } else if (chosen === 'Browse prompts') {
      yield* browseMenu(ui, cwd, models, generate, modify);
    } else {
      return yield* Effect.fail(`Unknown menu choice '${chosen}'.`);
    }
    return yield* mainMenu(ui, cwd, models, generate, modify);
  });

/**
 * Run one parsed args string end to end: parse, load, flow, save, notify.
 * @param args - raw slash-command args
 * @param ui - Pi ui dialogs
 * @param cwd - project working directory
 * @param models - picker options from resolveModelOptions
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @param models - picker options from {@link resolveModelOptions}
 * @param generate - injected agentic generation port
 * @param modify - injected agentic modification port
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  ui: InteractiveUi,
  cwd: string,
  models: ReadonlyArray<ModelOption>,
  generate: PromptGenerator,
  modify: PromptModifier,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const action = parseAction(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'List': {
        yield* store.list(cwd).pipe(Effect.flatMap((prompts) => listPrompts(ui, prompts)));
        return;
      }
      case 'Create': {
        const prompt = yield* createPrompt(ui, models, generate, action.name);
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
        const prompt = yield* modifyPrompt(ui, prompts, models, modify, action.name);
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
        yield* mainMenu(ui, cwd, models, generate, modify);
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
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<PromptStore.PromptStore>,
  generateFor: (cwd: string) => PromptGenerator,
  modifyFor: (cwd: string) => PromptModifier,
): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(
    api,
    COMMAND_NAME,
    COMMAND_DESCRIPTION,
    (args, ctx) =>
      run(
        args,
        ctx.ui,
        ctx.cwd,
        resolveModelOptions(ctx),
        generateFor(ctx.cwd),
        modifyFor(ctx.cwd),
      ).pipe(Effect.provide(live)),
    (error) => (error === CANCELLED ? 'info' : 'error'),
  );
