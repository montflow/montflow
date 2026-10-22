import { Effect } from 'effect';
import type { InteractionPort } from '../../modules/ports/interaction/index.js';
import type { ModelDescriptor, ModelPort } from '../../modules/ports/model/index.js';

/** One selectable model: the persisted `provider/model-id` label plus its flag. */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

/**
 * Picker rows for a model list: the current label first (marked), then the
 * rest deduplicated. Pure, so the caller can test the ordering without a TUI.
 * @param models - catalogue entries
 * @param current - current label, if any
 * @returns picker options
 */
export const modelOptions = (
  models: ReadonlyArray<ModelDescriptor>,
  current: string | undefined,
): ReadonlyArray<ModelOption> => {
  const seen = new Set<string>();
  const rows: Array<ModelOption> = [];
  const push = (label: string, isCurrent: boolean): void => {
    if (label === '' || seen.has(label)) return;
    seen.add(label);
    rows.push({ label, current: isCurrent });
  };
  if (current !== undefined) push(current, true);
  for (const model of models) push(model.label, model.label === current);
  return rows;
};

/**
 * Host-native replacement for the Pi model picker: list the catalogue through
 * `ModelPort`, let the host dialog filter it, and return the chosen label.
 * @param interaction - host dialog seam
 * @param model - model catalogue seam
 * @param current - the current label, pinned first
 * @returns chosen label, or undefined on cancel
 */
export const pickModel = (
  interaction: InteractionPort,
  model: ModelPort,
  current?: string,
): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    const models = yield* model.list();
    const options = modelOptions(models, current);
    if (options.length === 0) return undefined;
    return yield* interaction.select<string>({
      title: 'Model',
      options: options.map((option) => ({
        title: option.current ? `${option.label} (current)` : option.label,
        value: option.label,
      })),
    });
  });
