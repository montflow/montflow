import { Effect } from 'effect';
import { FallbackFile, FallbackTrigger, ModelCatalog, ModelChain } from '../../modules/index.js';
import * as Doctor from '../doctor/index.js';

/** What every engine needs: the workspace, and optionally an explicit server URL. */
export interface Scope {
  readonly cwd: string;
  readonly server?: string | undefined;
}

/**
 * Catalog and preference reads, injectable so the chain rules are testable
 * without a live host. `defaultDeps` is what the binary uses.
 */
export interface Deps {
  readonly catalog: (input: {
    readonly directory: string;
    readonly server?: string | undefined;
  }) => Effect.Effect<ReadonlyArray<ModelCatalog.Candidate>, ModelCatalog.CatalogError>;
  readonly preferences: () => Effect.Effect<ModelCatalog.Preferences>;
}

/** The live host: discover or use `--server`, then read `model.json`. */
export const defaultDeps: Deps = {
  catalog: ModelCatalog.load,
  preferences: ModelCatalog.preferences,
};

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** The current entry, decoded. */
export interface ShowResult {
  readonly path: string;
  readonly present: boolean;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
}

/** Read the chain a workspace already has. */
export const show = (scope: Scope): Effect.Effect<ShowResult, string> =>
  FallbackFile.read(scope.cwd).pipe(
    Effect.map((current) => ({
      path: current.path,
      present: current.present,
      chain: current.config.chain,
      triggers: current.config.triggers,
    })),
    Effect.catch((error) => Effect.fail(error.reason)),
  );

/** Catalog load input for a scope; the server override is omitted when absent. */
const catalogInput = (
  scope: Scope,
): { readonly directory: string; readonly server?: string | undefined } =>
  scope.server === undefined
    ? { directory: scope.cwd }
    : { directory: scope.cwd, server: scope.server };

/** The live catalog, ranked, plus the chain this module would suggest. */
export interface ModelsResult {
  readonly available: ReadonlyArray<ModelCatalog.Ranked>;
  readonly suggested: ReadonlyArray<string>;
}

/** List the models the machine can actually run. Requires a live host. */
export const models = (
  scope: Scope,
  limit: number,
  deps: Deps = defaultDeps,
): Effect.Effect<ModelsResult, string> =>
  Effect.gen(function* () {
    const prefs = yield* deps.preferences();
    const candidates = yield* deps
      .catalog(catalogInput(scope))
      .pipe(Effect.catch((error) => Effect.fail(error.reason)));
    const ranked = ModelCatalog.rank(candidates, prefs);
    return {
      available: ranked.slice(0, limit),
      suggested: ModelCatalog.suggest(ranked, prefs, Math.min(limit, 3)),
    };
  });

/** Input for `set`: configured labels and triggers, plus the catalog escape hatch. */
export interface SetInput {
  readonly chain: ReadonlyArray<string>;
  readonly triggers: ReadonlyArray<string> | undefined;
  readonly allowUnknown: boolean;
}

/** What `set` wrote and what it could not confirm. */
export interface SetResult {
  readonly path: string;
  readonly changed: boolean;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  readonly unknown: ReadonlyArray<string>;
  /** Whether the live catalog confirmed the chain; false when no server answered. */
  readonly checked: boolean;
  readonly note: string | undefined;
}

const parseTriggers = (ids: ReadonlyArray<string>): ReadonlyArray<FallbackTrigger.Trigger> =>
  ids.map((id) => {
    const trigger = FallbackTrigger.from(id);
    if (trigger === undefined) {
      throw new Error(
        `Unknown trigger '${id}'. Known triggers: ${FallbackTrigger.all.join(', ')}.`,
      );
    }
    return trigger;
  });

interface CatalogCheck {
  readonly unknown: ReadonlyArray<string>;
  readonly checked: boolean;
  readonly note: string | undefined;
}

const checkCatalog = (
  scope: Scope,
  chain: ReadonlyArray<ModelChain.Ref>,
  deps: Deps,
): Effect.Effect<CatalogCheck> =>
  Effect.gen(function* () {
    const loaded = yield* deps.catalog(catalogInput(scope)).pipe(
      Effect.map((candidates) => ({ ok: true as const, candidates })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, reason: error.reason })),
    );
    if (!loaded.ok) {
      return { unknown: [], checked: false, note: loaded.reason };
    }
    return {
      unknown: ModelCatalog.unknown(chain, loaded.candidates),
      checked: true,
      note: undefined,
    };
  });

/** Write a chain, refusing models the live catalog does not know. */
export const set = (
  scope: Scope,
  input: SetInput,
  deps: Deps = defaultDeps,
): Effect.Effect<SetResult, string> =>
  Effect.gen(function* () {
    const chain = yield* Effect.try({
      try: () => ModelChain.parse(input.chain),
      catch: (cause) => `Invalid chain entry: ${reasonOf(cause)}`,
    });
    if (chain.length === 0) {
      return yield* Effect.fail(
        'Chain is empty. Pass --chain <provider/model>[,<provider/model>...].',
      );
    }
    const triggers = yield* Effect.try({
      try: () =>
        input.triggers === undefined ? FallbackTrigger.defaults : parseTriggers(input.triggers),
      catch: (cause) => reasonOf(cause),
    });
    const catalog = yield* checkCatalog(scope, chain, deps);
    if (catalog.unknown.length > 0 && !input.allowUnknown) {
      return yield* Effect.fail(
        `Unknown model(s): ${catalog.unknown.join(', ')}. Run \`mf-model-fallback models\`, or pass --allow-unknown.`,
      );
    }
    const written = yield* FallbackFile.write(scope.cwd, { chain, triggers }).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    return {
      path: written.path,
      changed: written.changed,
      chain,
      triggers,
      unknown: catalog.unknown,
      checked: catalog.checked,
      note: catalog.note,
    };
  });

/** A verified chain. */
export interface VerifyResult {
  readonly path: string;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  /** How many catalog models the chain was checked against. */
  readonly catalog: number;
}

/** Validate the configured chain against the live catalog. */
export const verify = (
  scope: Scope,
  deps: Deps = defaultDeps,
): Effect.Effect<VerifyResult, string> =>
  Effect.gen(function* () {
    const current = yield* FallbackFile.read(scope.cwd).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    if (current.config.chain.length === 0) {
      return yield* Effect.fail(
        `No fallback chain configured in ${current.path}. Run \`mf-model-fallback set --chain ...\`.`,
      );
    }
    const candidates = yield* deps
      .catalog(catalogInput(scope))
      .pipe(Effect.catch((error) => Effect.fail(error.reason)));
    const unknown = ModelCatalog.unknown(current.config.chain, candidates);
    if (unknown.length > 0) {
      return yield* Effect.fail(
        `Unknown model(s) in ${current.path}: ${unknown.join(', ')}. Run \`mf-model-fallback models\` and update the chain.`,
      );
    }
    return {
      path: current.path,
      chain: current.config.chain,
      triggers: current.config.triggers,
      catalog: candidates.length,
    };
  });

/** Remove the entry; other plugins in the file are untouched. */
export interface RemoveResult {
  readonly path: string;
  readonly changed: boolean;
}

export const remove = (scope: Scope): Effect.Effect<RemoveResult, string> =>
  FallbackFile.remove(scope.cwd).pipe(
    Effect.map((written) => ({ path: written.path, changed: written.changed })),
    Effect.catch((error) => Effect.fail(error.reason)),
  );

/** Install or check the packaged prompt template. */
export const doctor = (scope: Scope, check: boolean): Effect.Effect<Doctor.DoctorResult, string> =>
  Doctor.run(scope.cwd, { check, invocation: 'mf-model-fallback doctor' });
