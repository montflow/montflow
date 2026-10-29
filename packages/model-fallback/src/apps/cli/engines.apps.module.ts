import { Effect } from 'effect';
import {
  FallbackFile,
  FallbackStore,
  FallbackTrigger,
  ModelCatalog,
  ModelChain,
} from '../../modules/index.js';
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

/** Catalog load input for a scope; the server override is omitted when absent. */
const catalogInput = (
  scope: Scope,
): { readonly directory: string; readonly server?: string | undefined } =>
  scope.server === undefined
    ? { directory: scope.cwd }
    : { directory: scope.cwd, server: scope.server };

/** The configuration in force, and what kept any store out. */
export interface ShowResult {
  readonly path: string;
  readonly present: boolean;
  readonly source: FallbackStore.Source;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  readonly issues: ReadonlyArray<FallbackStore.Issue>;
  /** Legacy options exist but are shadowed by a valid store. */
  readonly legacy: boolean;
}

/** The legacy `plugins[].options` chain, when it decodes. Fails on a broken file. */
const legacyStrict = (cwd: string): Effect.Effect<FallbackStore.Config | undefined, string> =>
  FallbackFile.read(cwd).pipe(
    Effect.map((current) => (current.config.chain.length === 0 ? undefined : current.config)),
    Effect.catch((error) => Effect.fail(error.reason)),
  );

/**
 * Legacy options for reads that must not depend on the host config: a broken
 * `opencode.jsonc` must never shadow a valid store, but it is reported.
 */
const legacyRead = (
  cwd: string,
): Effect.Effect<{
  readonly config?: FallbackStore.Config;
  readonly issue?: FallbackStore.Issue;
}> =>
  FallbackFile.read(cwd).pipe(
    Effect.map((current) => (current.config.chain.length === 0 ? {} : { config: current.config })),
    Effect.catch((error) =>
      Effect.succeed({
        issue: {
          field: 'options',
          message: FallbackStore.plain(error.reason),
          fix: 'fix the opencode.jsonc options by hand, then run mf-model-fallback migrate',
        },
      }),
    ),
  );

/** Resolve what the plugin would act on, reporting every store issue. */
const snapshot = (scope: Scope): Effect.Effect<FallbackStore.Snapshot, string> =>
  Effect.gen(function* () {
    const legacy = yield* legacyRead(scope.cwd);
    return yield* FallbackStore.resolveWith(scope.cwd, legacy.config, legacy.issue);
  });

const showOf = (value: FallbackStore.Snapshot): ShowResult => ({
  path: value.path,
  present: value.present,
  source: value.source,
  chain: value.config.chain,
  triggers: value.config.triggers,
  issues: value.issues,
  legacy: value.legacy,
});

/** Read the configuration in force and where it came from. */
export const show = (scope: Scope): Effect.Effect<ShowResult, string> =>
  snapshot(scope).pipe(Effect.map(showOf));

/** Offline shape report: presence, source, chain, triggers, and issues. */
export interface StatusResult {
  readonly ok: boolean;
  readonly path: string;
  readonly present: boolean;
  readonly source: FallbackStore.Source;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  readonly issues: ReadonlyArray<FallbackStore.Issue>;
  /** Legacy options exist but are shadowed by a valid store. */
  readonly legacy: boolean;
}

/**
 * Validate the store without a live host. Not configured is valid; a store
 * that exists but does not match the shape is not.
 */
export const status = (scope: Scope): Effect.Effect<StatusResult, string> =>
  snapshot(scope).pipe(
    Effect.map((value) => ({
      ...showOf(value),
      ok: value.issues.length === 0,
    })),
  );

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
  /** True when legacy options are still present and now ignored. */
  readonly legacy: boolean;
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
    const written = yield* FallbackStore.write(scope.cwd, { chain, triggers }).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    const pending = yield* legacyRead(scope.cwd);
    return {
      path: written.path,
      changed: written.changed,
      chain,
      triggers,
      unknown: catalog.unknown,
      checked: catalog.checked,
      note: catalog.note,
      legacy: pending.config !== undefined,
    };
  });

/** Move legacy options into the store, then drop them from `opencode.jsonc`. */
export interface MigrateResult {
  readonly path: string;
  readonly changed: boolean;
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  readonly cleared: boolean;
}

export const migrate = (scope: Scope): Effect.Effect<MigrateResult, string> =>
  Effect.gen(function* () {
    const fallback = yield* legacyStrict(scope.cwd);
    if (fallback === undefined) {
      return yield* Effect.fail(
        'Nothing to migrate: no chain in opencode.jsonc options. Write one with `set`.',
      );
    }
    const existing = yield* FallbackStore.read(scope.cwd);
    if (existing.present && existing.issues.length === 0) {
      return yield* Effect.fail(
        `${FallbackStore.file(scope.cwd)} is already valid; remove it first if the legacy options should win.`,
      );
    }
    const written = yield* FallbackStore.write(scope.cwd, fallback).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    const cleared = yield* FallbackFile.clearOptions(scope.cwd).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    return {
      path: written.path,
      changed: written.changed,
      chain: fallback.chain,
      triggers: fallback.triggers,
      cleared: cleared.changed,
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
    const value = yield* snapshot(scope);
    if (value.issues.length > 0) {
      const details = value.issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ');
      return yield* Effect.fail(
        `${value.path} is invalid (${details}). Run \`mf-model-fallback status\` for the full report.`,
      );
    }
    if (value.config.chain.length === 0) {
      return yield* Effect.fail(
        `No fallback chain configured (${value.path}). Run \`mf-model-fallback set --chain ...\`.`,
      );
    }
    const candidates = yield* deps
      .catalog(catalogInput(scope))
      .pipe(Effect.catch((error) => Effect.fail(error.reason)));
    const unknown = ModelCatalog.unknown(value.config.chain, candidates);
    if (unknown.length > 0) {
      return yield* Effect.fail(
        `Unknown model(s) in ${value.path}: ${unknown.join(', ')}. Run \`mf-model-fallback models\` and update the chain.`,
      );
    }
    return {
      path: value.path,
      chain: value.config.chain,
      triggers: value.config.triggers,
      catalog: candidates.length,
    };
  });

/** Remove the store and any legacy options, so "removed" means inactive. */
export interface RemoveResult {
  readonly path: string;
  readonly changed: boolean;
  readonly cleared: boolean;
  /** Why legacy options could not be cleared; the store was still removed. */
  readonly warning?: string | undefined;
}

export const remove = (scope: Scope): Effect.Effect<RemoveResult, string> =>
  Effect.gen(function* () {
    // Clear the legacy block first; a failure is reported, but the store is
    // still removed so "removed" means the chain is no longer in force.
    const cleared = yield* FallbackFile.clearOptions(scope.cwd).pipe(
      Effect.map((written) => ({ changed: written.changed, warning: undefined })),
      Effect.catch((error) => Effect.succeed({ changed: false, warning: error.reason })),
    );
    const store = yield* FallbackStore.remove(scope.cwd).pipe(
      Effect.catch((error) => Effect.fail(error.reason)),
    );
    const path = FallbackStore.file(scope.cwd);
    if (cleared.warning === undefined) {
      return { path, changed: store.changed, cleared: cleared.changed };
    }
    return { path, changed: store.changed, cleared: cleared.changed, warning: cleared.warning };
  });

/** Install or check the packaged prompt template. */
export const doctor = (scope: Scope, check: boolean): Effect.Effect<Doctor.DoctorResult, string> =>
  Doctor.run(scope.cwd, { check, invocation: 'mf-model-fallback doctor' });
