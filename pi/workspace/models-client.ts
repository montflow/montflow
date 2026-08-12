import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import type { SelectItem } from '@earendil-works/pi-tui';

/**
 * Model-picker helpers for the review-loop UI.
 *
 * Model strings in loop configs are `provider/model-id` (or a bare model id
 * Pi's model registry can resolve). Instead of typing them by hand, the
 * interactive wizard lists the models that are actually pickable in this
 * session — the session-scoped set when `--models`/`enabledModels` scoping is
 * configured (same set the built-in `/model` picker shows), otherwise the
 * full available catalogue — and preselects the currently active model.
 */

/** One selectable model in the picker. */
export interface ModelChoice {
  /** Full `provider/model-id` string stored in loop configs. */
  readonly id: string;
  /** Provider id, e.g. `anthropic`. */
  readonly provider: string;
  /** Model id without provider prefix, e.g. `claude-sonnet-4-5`. */
  readonly modelId: string;
  /** Human-readable model name. */
  readonly name: string;
  /** True when this is the session's currently active model. */
  readonly isCurrent: boolean;
}

/** Minimal shape needed to format a model id. */
export interface ModelLike {
  readonly provider: string;
  readonly id: string;
}

/**
 * Formats a `provider/model-id` config string from a model.
 * @param {ModelLike} model The model (provider + id required)
 * @returns The `provider/model-id` string
 */
export const modelIdOf = (model: ModelLike): string => `${model.provider}/${model.id}`;

/**
 * The `provider/model-id` of the session's active model, or undefined when no
 * model is active.
 * @param {ExtensionContext} ctx The extension context
 * @returns The current model id, or undefined
 */
export const currentModelId = (ctx: ExtensionContext): string | undefined => {
  const model = ctx.model;
  return model === undefined ? undefined : modelIdOf(model);
};

/**
 * Lists the models the user can pick for a review run: the session-scoped set
 * when scoping is configured (mirrors the built-in `/model` picker), otherwise
 * every available model in the registry. The active model is flagged as
 * `isCurrent`.
 * @param {ExtensionContext} ctx The extension context
 * @returns The pickable model choices
 */
export const listModelChoices = (ctx: ExtensionContext): readonly ModelChoice[] => {
  const current = currentModelId(ctx);
  const models: readonly Model<any>[] =
    ctx.scopedModels.length > 0
      ? ctx.scopedModels.map((entry) => entry.model)
      : ctx.modelRegistry.getAvailable();
  return models.map((model) => ({
    id: modelIdOf(model),
    provider: model.provider,
    modelId: model.id,
    name: model.name,
    isCurrent: modelIdOf(model) === current,
  }));
};

/**
 * Matches a stored model string against the pickable choices, resolving bare
 * model ids to a `provider/model-id` choice. Bare ids first try the current
 * model's provider prefix (so `deepseek-v4-pro` resolves to
 * `deepseek/deepseek-v4-pro`), then any choice with that model id.
 * @param {readonly ModelChoice[]} choices The pickable choices
 * @param {string | undefined} candidate The stored id string to look up
 * @param {string | undefined} currentProvider Provider of the session's active model
 * @returns The matching choice, or undefined
 */
const findModelChoice = (
  choices: readonly ModelChoice[],
  candidate: string | undefined,
  currentProvider: string | undefined,
): ModelChoice | undefined => {
  if (candidate === undefined) return undefined;
  const exact = choices.find((choice) => choice.id === candidate);
  if (exact !== undefined) return exact;
  if (candidate.includes('/')) return undefined;
  if (currentProvider !== undefined) {
    const prefixed = choices.find((choice) => choice.id === `${currentProvider}/${candidate}`);
    if (prefixed !== undefined) return prefixed;
  }
  return choices.find((choice) => choice.modelId === candidate);
};

/**
 * True when the given model id string (bare or `provider/model-id`) is
 * pickable in this session. Shares the single matching predicate with
 * `resolveInitialModel` so the two cannot drift apart.
 * @param {ExtensionContext} ctx The extension context
 * @param {string} id The model id string to look up
 * @returns True when the model is in the pickable set
 */
export const hasModelChoice = (ctx: ExtensionContext, id: string): boolean =>
  findModelChoice(listModelChoices(ctx), id, currentModelId(ctx)?.split('/')[0]) !== undefined;

/**
 * Resolves the model id to preselect in the picker: the first of the preferred
 * ids that is pickable (bare ids are resolved to their `provider/model-id`
 * form), then the session's current model, then the first available choice.
 * Returns undefined when no models are pickable.
 * @param {ExtensionContext} ctx The extension context
 * @param {Array<string | undefined>} preferred Candidate ids in priority order
 * @returns The preselected model id, or undefined
 */
export const resolveInitialModel = (
  ctx: ExtensionContext,
  ...preferred: Array<string | undefined>
): string | undefined => {
  const choices = listModelChoices(ctx);
  if (choices.length === 0) return undefined;
  const current = currentModelId(ctx);
  const candidates = [...preferred, current];
  for (const candidate of candidates) {
    const choice = findModelChoice(choices, candidate, current?.split('/')[0]);
    if (choice !== undefined) return choice.id;
  }
  return choices[0]?.id;
};

/**
 * SelectItem view of the model choices for the searchable picker dialog. The
 * current model's description is tagged so it is easy to spot while searching.
 * @param {readonly ModelChoice[]} choices The model choices
 * @returns The SelectItems
 */
export const modelSelectItems = (choices: readonly ModelChoice[]): SelectItem[] =>
  choices.map((choice) => ({
    value: choice.id,
    label: choice.id,
    description: choice.isCurrent ? `${choice.name} — current model` : choice.name,
  }));
