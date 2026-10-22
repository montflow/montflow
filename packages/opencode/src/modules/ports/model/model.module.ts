import type { Model } from '@opencode/schema/model';
import { Model as ModelSchema } from '@opencode/schema/model';
import { Effect, Schema, type Scope } from 'effect';

/**
 * One selectable model, flattened for pickers and prompts that store a
 * `provider/model-id` label rather than a branded `Model.Ref`.
 */
export interface ModelDescriptor {
  readonly label: string;
  readonly providerID: string;
  readonly modelID: string;
}

/** Failure raised when a `provider/model-id` label cannot be parsed. */
export class ModelResolveError extends Schema.TaggedError<ModelResolveError>()(
  'ModelResolveError',
  {
    label: Schema.String,
    message: Schema.String,
  },
) {}

/** The catalog fields the port reads from a host model entry. */
export interface ModelEntry {
  readonly providerID: string;
  readonly id: string;
}

/** The slice of the host `ModelEditor` the port reads. */
export interface ModelEditor {
  list(providerID?: string): readonly ModelEntry[];
  get(providerID: string, modelID: string): ModelEntry | undefined;
  readonly default: {
    get(): { readonly providerID: string; readonly modelID: string } | undefined;
  };
}

/**
 * The slice of the host server context `ModelPort` needs. `transform` carries
 * the editor used to read the live catalogue without owning it; `list` and
 * `default` read the host's model API.
 */
export interface ModelContext {
  readonly model?:
    | {
        readonly transform: (
          callback: (editor: ModelEditor) => void,
        ) => Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never, Scope.Scope>;
        readonly list: () => Effect.Effect<{ readonly data: ReadonlyArray<ModelEntry> }, unknown>;
        readonly default: () => Effect.Effect<{ readonly data: ModelEntry | undefined }, unknown>;
      }
    | undefined;
  /**
   * TUI half: the host already synced the location's model catalogue, so a
   * plugin reads it without a session or an Effect round-trip.
   */
  readonly data?:
    | {
        readonly location: {
          readonly model: {
            list(): ReadonlyArray<ModelEntry>;
          };
        };
      }
    | undefined;
  /** TUI half: the prompt's selected model, when one is selected. */
  readonly ui?:
    | {
        readonly model: {
          current():
            | { readonly providerID: string; readonly modelID: string; readonly variant?: string }
            | undefined;
        };
      }
    | undefined;
}

/**
 * Model selection seam. Resolves montflow's persisted `provider/model-id`
 * labels against the host catalogue and back into the branded `Model.Ref`
 * a native session accepts.
 */
export interface ModelPort {
  readonly list: (providerID?: string) => Effect.Effect<readonly ModelDescriptor[]>;
  readonly get: (providerID: string, modelID: string) => Effect.Effect<ModelEntry | undefined>;
  readonly default: () => Effect.Effect<
    { readonly providerID: string; readonly modelID: string } | undefined
  >;
  readonly resolve: (label: string) => Effect.Effect<Model.Ref, ModelResolveError>;
}

const unavailable = (): Error =>
  new Error('ModelPort requires a server plugin context (ctx.model)');

/** Join a catalog entry into the persisted `provider/model-id` label. */
const labelOf = (model: ModelEntry): string => `${model.providerID}/${model.id}`;

/**
 * Run a callback over the host model editor and return the collected value.
 * The transform scope is closed before the value is handed back, so callers
 * never leak a registration to read once.
 */
const read = <A>(context: ModelContext, select: (editor: ModelEditor) => A): Effect.Effect<A> => {
  const model = context.model;
  if (model === undefined) return Effect.die(unavailable());
  return Effect.gen(function* () {
    let value: A | undefined;
    const registration = yield* model.transform((editor) => {
      value = select(editor);
    });
    yield* registration.dispose;
    // SAFETY: `transform` runs the callback synchronously, so `select` assigns
    // before the scope closes; a host contract change dies here, not silently.
    return value as A;
  }).pipe(Effect.scoped);
};

/** The catalog entry `providerID/modelID` label matches, across both halves. */
const findEntry = (
  context: ModelContext,
  providerID: string,
  modelID: string,
): ModelEntry | undefined => {
  const catalog = context.data?.location.model.list();
  return catalog?.find((entry) => entry.providerID === providerID && entry.id === modelID);
};

/** Build the model seam over the host model domain. */
export const makeModelPort = (context: ModelContext): ModelPort => ({
  list: (providerID) => {
    if (context.model === undefined) {
      const catalog = context.data?.location.model.list();
      if (catalog === undefined) return Effect.die(unavailable());
      return Effect.succeed(
        (providerID === undefined
          ? catalog
          : catalog.filter((entry) => entry.providerID === providerID)
        ).map((entry) => ({
          label: labelOf(entry),
          providerID: entry.providerID,
          modelID: entry.id,
        })),
      );
    }
    return read(context, (editor) =>
      (providerID === undefined ? editor.list() : editor.list(providerID)).map((model) => ({
        label: labelOf(model),
        providerID: model.providerID,
        modelID: model.id,
      })),
    );
  },
  get: (providerID, modelID) => {
    if (context.model === undefined) {
      if (context.data === undefined) return Effect.die(unavailable());
      return Effect.succeed(findEntry(context, providerID, modelID));
    }
    return read(context, (editor) => editor.get(providerID, modelID));
  },
  default: () => {
    if (context.model === undefined) {
      const ui = context.ui;
      if (ui === undefined) return Effect.die(unavailable());
      const current = ui.model.current();
      return Effect.succeed(
        current === undefined
          ? undefined
          : { providerID: current.providerID, modelID: current.modelID },
      );
    }
    return read(context, (editor) => editor.default.get());
  },
  resolve: (label) =>
    Effect.try({
      try: () => ModelSchema.Ref.parse(label),
      catch: (cause) =>
        new ModelResolveError({
          label,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    }),
});
