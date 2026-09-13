import { Effect } from 'effect';
import {
  CANCELLED,
  type InteractiveUi,
  type LoadingFn,
  type ModelOption,
  type ModelPickerFn,
} from '../dialogs/index.js';

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

/** Bottom menu entry opening the filter step. */
export const PICK_ANOTHER = 'Pick another model…';

/** Display label with the current-run marker. */
export const displayModel = (option: ModelOption): string =>
  option.current ? `${option.label} (current)` : option.label;

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
  if (match === undefined) return Effect.fail(`Unknown model '${picked}'.`);
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
    if (candidates.length === 0) return yield* Effect.fail(`No models match '${query}'.`);
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
 * menu-driven `pickModel`. Notifies the chosen runtime, unless the
 * loading modal is showing it instead.
 * @param ui - Pi ui dialogs
 * @param models - picker options from {@link resolveModelOptions}
 * @param modelPicker - TUI widget port, if available
 * @param verb - progress verb for the notify line (Generating/Modifying)
 * @param loading - TUI loading-modal port, if available (silences notifies)
 * @returns Effect resolving to the picked label (undefined = session model)
 */
export const pickAgenticModel = (
  ui: InteractiveUi,
  models: ReadonlyArray<ModelOption>,
  modelPicker: ModelPickerFn | undefined,
  verb: string,
  loading?: LoadingFn | undefined,
): Effect.Effect<string | undefined, string> =>
  Effect.gen(function* () {
    const silent = loading !== undefined;
    if (models.length === 0) {
      if (!silent) yield* Effect.sync(() => ui.notify(`${verb} with the session model…`, 'info'));
      return undefined;
    }
    if (modelPicker !== undefined) {
      const picked = yield* Effect.promise(() => modelPicker(models));
      if (picked === undefined) return yield* Effect.fail(CANCELLED);
      if (!silent) yield* Effect.sync(() => ui.notify(`${verb} with ${picked}…`, 'info'));
      return picked;
    }
    const picked = yield* pickModel(ui, models);
    yield* Effect.sync(() => ui.notify(`${verb} with ${picked}…`, 'info'));
    return picked;
  });

/**
 * Run an agentic Effect behind the loading modal when available, else
 * directly. The modal message names the runtime the spinner covers.
 * @param loading - TUI loading-modal port, if available
 * @param message - status text beside the spinner
 * @param self - closed Effect to run
 * @returns Effect resolving to the wrapped value, failing with its error
 */
export const runWithLoading = <A, E>(
  loading: LoadingFn | undefined,
  message: string,
  self: Effect.Effect<A, E, never>,
): Effect.Effect<A, E> => (loading !== undefined ? loading(message, self) : self);
