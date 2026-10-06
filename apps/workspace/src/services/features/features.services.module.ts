// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: features live under .agents/@montflow/features; migrate to FileSystem when the app moves onto the platform layer graph.
import { readdir, readFile, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for feature files; both go away with the FileSystem migration.
import { join } from 'node:path';
import type { RunDetail as EngineRunDetail } from '@montflow/pi-runs';
import { Data, Effect } from 'effect';
import * as Runs from '../runs/index.js';

/**
 * Lazy handle to the pi-features runtime. Static imports are type-only
 * (erased at build) — the runtime resolves here, on first use, never at
 * dashboard boot. A missing extension surfaces as a toast, not a crash.
 */
type PiFeaturesLib = typeof import('@montflow/pi-features');

/** Failure loading the pi-features runtime. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/FeaturesExtensionLoadError')<{
  readonly message: string;
}> {}

/** Cached extension module promise. Cleared on failure so retrying reloads it. */
let cachedLib: Promise<PiFeaturesLib> | undefined;

/** Test hook: drop the cached runtime so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
};

/**
 * Load the pi-features runtime as an Effect, caching the module across
 * flows.
 * @returns Effect resolving to the extension module namespace
 */
export const loadPiFeatures = (): Effect.Effect<PiFeaturesLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => {
      cachedLib ??= import('@montflow/pi-features').then(
        (libs) => libs,
        (cause: unknown) => {
          cachedLib = undefined;
          throw cause;
        },
      );
      return cachedLib;
    },
    catch: (cause) =>
      new ExtensionLoadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

/** One file inside a feature directory, POSIX-relative to the feature root. */
export interface SnapshotFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Absolute features directory for a working directory:
 * `<cwd>/.agents/@montflow/features`.
 * @param root - workspace root
 * @returns absolute features directory
 */
export const featuresDir = (root: string): string => join(root, '.agents', '@montflow', 'features');

/**
 * True when the features directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const featuresInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(featuresDir(root)).then(
      () => true,
      () => false,
    ),
  );

/** Read every file under one feature directory as POSIX-relative paths. */
const readSnapshot = async (root: string, name: string): Promise<ReadonlyArray<SnapshotFile>> => {
  const dir = join(featuresDir(root), name);
  const entries = await readdir(dir, { recursive: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<SnapshotFile | undefined> => {
      const absolute = join(dir, entry);
      const info = await stat(absolute);
      if (!info.isFile()) return undefined;
      return {
        path: entry.split('\\').join('/'),
        content: await readFile(absolute, 'utf8'),
      };
    }),
  );
  return files.filter((file): file is SnapshotFile => file !== undefined);
};

/** One feature row for the dashboard list. */
export interface FeatureSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: string;
  readonly status: string;
  /** True when a live run is bound to this feature. */
  readonly active: boolean;
  readonly total: number;
  readonly complete: number;
  readonly issues: number;
  readonly valid: boolean;
}

/** Task counts keyed by canonical status. */
export type FeatureCounts = Readonly<
  Record<'pending' | 'in-progress' | 'complete' | 'blocked', number>
>;

/** One task row inside a feature detail phase. */
export interface FeatureTaskRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
}

/** One phase roll-up inside a feature detail. */
export interface FeaturePhaseRow {
  readonly phase: string;
  readonly locked: boolean;
  readonly tasks: ReadonlyArray<FeatureTaskRow>;
}

/** FEATURE.md metadata for the detail header. */
export interface FeatureMeta {
  readonly name: string;
  readonly status: string;
  readonly workspaceType: string;
  readonly author: string;
  readonly created: string;
  readonly lockedPhases: ReadonlyArray<string>;
  readonly description: string;
}

/** One verification issue shown in the detail. */
export interface FeatureIssue {
  readonly field: string;
  readonly message: string;
}

/** Full feature detail: header metadata, per-phase tasks, and issues. */
export interface FeatureDetail {
  readonly summary: FeatureSummary;
  readonly meta: FeatureMeta | undefined;
  readonly state: string;
  readonly counts: FeatureCounts;
  readonly phases: ReadonlyArray<FeaturePhaseRow>;
  readonly issues: ReadonlyArray<FeatureIssue>;
}

/** Staged boot phase behind the features-panel Loader. */
export type FeaturesPhase = 'extension' | 'features';

const EMPTY_COUNTS = {
  pending: 0,
  'in-progress': 0,
  complete: 0,
  blocked: 0,
} satisfies FeatureCounts;

/** First non-empty line of the `## Description` section. */
const descriptionOf = (content: string): string => {
  const match = /^## Description\s*\n+([^\n#].*)$/m.exec(content);
  return match?.[1]?.trim() ?? '';
};

/** Phase prefix of a task id, e.g. `AA012` → `AA`. */
const phaseOf = (id: string): string => id.replace(/\d+$/, '');

/** Parsed pieces shared by the summary and the detail builders. */
const inspect = (
  libs: PiFeaturesLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  active: boolean,
) => {
  const featureFile = files.find((file) => file.path === 'FEATURE.md');
  const feature =
    featureFile === undefined ? undefined : libs.Feature.parseFeatureFile(featureFile.content);
  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .filter((task) => task !== undefined);
  const verify = libs.Structure.verifyFeatureTree({ name: id, files });
  const analysis =
    feature === undefined
      ? undefined
      : libs.Lifecycle.analyze({
          status: feature.status,
          lockedPhases: feature.lockedPhases,
          tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
          active,
        });
  return { feature, featureFile, tasks, verify, analysis };
};

/** Bridge one feature directory into a dashboard row. Total by construction. */
const summarize = (
  libs: PiFeaturesLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  active: boolean,
): FeatureSummary => {
  const { feature, featureFile, tasks, verify, analysis } = inspect(libs, id, files, active);
  return {
    id,
    name: feature?.name ?? id,
    description: descriptionOf(featureFile?.content ?? '') || (feature?.name ?? id),
    state: analysis?.state ?? 'inconsistent',
    status: feature?.status ?? 'unknown',
    active,
    total: tasks.length,
    complete: tasks.filter((task) => task.status === 'complete').length,
    issues: verify.issues.length,
    valid: verify.valid,
  };
};

/**
 * Feature slugs with a live run bound: persisted runs whose `feature` is
 * set and whose id is in the runner's live registry. A missing runs store
 * or an unbuilt runtime reads as empty, never an error.
 * @param root - workspace root (runs store and runner owner)
 * @returns Effect resolving to the active feature slugs
 */
export const activeFeatureIds = (root: string): Effect.Effect<ReadonlySet<string>> =>
  Effect.gen(function* () {
    const runs = yield* Runs.fetchRuns(root).pipe(Effect.orElseSucceed(() => []));
    const live = yield* Runs.liveRunIds(root).pipe(Effect.orElseSucceed(() => new Set<string>()));
    return new Set(
      runs.filter((run) => run.feature !== '' && live.has(run.id)).map((run) => run.feature),
    );
  });

/** List every feature directory as a summary row, alphabetical. */
const readFeatures = async (
  root: string,
  libs: PiFeaturesLib,
  active: ReadonlySet<string>,
): Promise<ReadonlyArray<FeatureSummary>> => {
  const dir = featuresDir(root);
  const entries = await readdir(dir);
  const names = entries.filter((entry) => !entry.startsWith('.')).toSorted();
  const rows = await Promise.all(
    names.map(async (name): Promise<FeatureSummary | undefined> => {
      const info = await stat(join(dir, name));
      if (!info.isDirectory()) return undefined;
      return summarize(libs, name, await readSnapshot(root, name), active.has(name));
    }),
  );
  return rows.filter((row): row is FeatureSummary => row !== undefined);
};

/**
 * Feature rows for the TUI boot: load the extension runtime, then list
 * and verify every feature directory. A missing directory reads as an
 * empty list so the panel shows its empty note instead of an error.
 * @param root - workspace root (features directory owner)
 * @returns Effect resolving to summary rows, failing with displayable message
 */
export const fetchFeatures = (root: string): Effect.Effect<ReadonlyArray<FeatureSummary>, string> =>
  loadPiFeatures().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const active = yield* activeFeatureIds(root);
        return yield* Effect.tryPromise({
          try: () => readFeatures(root, libs, active),
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
        });
      }),
    ),
    Effect.catch((error) =>
      error.includes('ENOENT') || error.includes('no such file')
        ? Effect.succeed<ReadonlyArray<FeatureSummary>>([])
        : Effect.fail(error),
    ),
  );

/**
 * Load one feature for the detail page: header metadata, per-phase
 * tasks, verification issues, and the derived lifecycle state.
 * @param root - workspace root (features directory owner)
 * @param id - feature directory name
 * @returns Effect resolving to the detail, failing with displayable message
 */
export const loadFeature = (root: string, id: string): Effect.Effect<FeatureDetail, string> =>
  loadPiFeatures().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.gen(function* () {
        const active = yield* activeFeatureIds(root);
        const isActive = active.has(id);
        return yield* Effect.tryPromise({
          try: async (): Promise<FeatureDetail> => {
            const files = await readSnapshot(root, id);
            const { feature, featureFile, tasks, verify, analysis } = inspect(
              libs,
              id,
              files,
              isActive,
            );
            const phases = (analysis?.phases ?? []).map((phase) => ({
              phase: phase.phase,
              locked: phase.locked,
              tasks: tasks
                .filter((task) => phaseOf(task.id) === phase.phase)
                .map((task) => ({
                  id: task.id,
                  name: task.name,
                  type: task.type,
                  status: task.status,
                })),
            }));
            return {
              summary: summarize(libs, id, files, isActive),
              meta:
                feature === undefined
                  ? undefined
                  : {
                      name: feature.name,
                      status: feature.status,
                      workspaceType: feature.workspaceType,
                      author: feature.author,
                      created: feature.created,
                      lockedPhases: feature.lockedPhases,
                      description: descriptionOf(featureFile?.content ?? ''),
                    },
              state: analysis?.state ?? 'inconsistent',
              counts: analysis?.counts ?? EMPTY_COUNTS,
              phases,
              issues: verify.issues,
            };
          },
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
        });
      }),
    ),
  );

/**
 * Raw feature directory names under the features root, regardless of
 * decode validity. Used to snapshot the store at dispatch and to find the
 * feature an author run created after it settles. Dotfiles are skipped.
 * @param root - workspace root (features store owner)
 * @returns Effect resolving to directory names (empty when the store is missing)
 */
export const rawFeatureIds = (root: string): Effect.Effect<ReadonlyArray<string>> =>
  Effect.promise((): Promise<ReadonlyArray<string>> =>
    readdir(featuresDir(root)).then(
      (names) => names.filter((name) => !name.startsWith('.')),
      () => [],
    ),
  );

/**
 * Tool allowlist for a feature-author run: the standard workspace set plus
 * `bash`, so the agent can run the mechanical checker before finishing.
 * `@montflow/pi-runs` unions the interaction tools (`ask_user` /
 * `notify_user`) into whatever allowlist is passed.
 */
export const FEATURE_RUN_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/** One transcript line, shared by the engine detail and the dashboard row. */
interface TranscriptLine {
  readonly role: string;
  readonly text: string;
}

/**
 * Final assistant text from a settled run's transcript, or undefined when
 * the run produced no assistant turn.
 * @param events - stored transcript events
 * @returns last assistant text, if any
 */
export const finalAssistantText = (events: ReadonlyArray<TranscriptLine>): string | undefined =>
  events.findLast((event) => event.role === 'assistant')?.text;

/** How a settled author run's feature was resolved. */
export type AuthoredFeaturePick =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'ambiguous'; readonly ids: ReadonlyArray<string> }
  | { readonly kind: 'none' };

/**
 * Resolve the feature a settled author run created. Prefers the fresh
 * feature named in the run's final reply — correlating concurrent authors
 * to their own run — and falls back to the name diff only when exactly one
 * fresh feature exists (unambiguous).
 * @param reply - final assistant text from the run, if any
 * @param fresh - feature directory ids added since the run was dispatched
 * @returns the chosen feature, an ambiguity, or none
 */
export const pickAuthoredFeature = (
  reply: string | undefined,
  fresh: ReadonlyArray<string>,
): AuthoredFeaturePick => {
  if (fresh.length === 0) return { kind: 'none' };
  const named = reply === undefined ? [] : fresh.filter((id) => reply.includes(id));
  if (named.length === 1) {
    const id = named[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  if (fresh.length === 1) {
    const id = fresh[0];
    if (id !== undefined) return { kind: 'one', id };
  }
  return { kind: 'ambiguous', ids: fresh.toSorted() };
};

/**
 * TUI callbacks for a dispatched author run's completion: the fresh
 * feature was found (refresh + open its detail), or the run settled
 * without one (surface the reason). The run id lets the TUI clear only the
 * matching dispatched-run keybind target.
 */
export interface BeginFlowHooks {
  /** Fresh feature found after the author run settled. */
  readonly onFeatureCreated?: ((featureId: string, runId: string) => void) | undefined;
  /** Author run settled without creating a feature. */
  readonly onFeatureFailed?: ((message: string, runId: string) => void) | undefined;
}

/**
 * Completion hook for a dispatched author run: resolve the feature the run
 * authored (reply-correlated, name-diff fallback) and notify the hooks.
 * Exported so a resumed author run can re-attach the same hook through
 * `Runs.resumeRun` after an app restart.
 * @param root - workspace root (features store owner)
 * @param runId - the author run id
 * @param beforeIds - feature directory ids snapshotted at dispatch, or undefined after a restart
 * @param hooks - TUI completion callbacks
 * @returns the `onSettled` hook
 */
export const featureAuthorCompletion =
  (
    root: string,
    runId: string,
    beforeIds: ReadonlyArray<string> | undefined,
    hooks?: BeginFlowHooks,
  ): ((detail: EngineRunDetail) => Effect.Effect<void>) =>
  (detail) =>
    Effect.gen(function* () {
      const afterIds = yield* rawFeatureIds(root);
      const freshIds = afterIds.filter((id) => !(beforeIds ?? []).includes(id));
      const pick = pickAuthoredFeature(finalAssistantText(detail.events), freshIds);
      if (pick.kind === 'one') {
        hooks?.onFeatureCreated?.(pick.id, runId);
        return;
      }
      if (pick.kind === 'ambiguous') {
        hooks?.onFeatureFailed?.(
          `Run '${runId}' created several features (${pick.ids.join(', ')}) — open the one you want from the list.`,
          runId,
        );
        return;
      }
      hooks?.onFeatureFailed?.(
        `Run '${runId}' finished without creating a feature — try describing it differently.`,
        runId,
      );
    });

/** Inputs for dispatching a feature-author run. */
export interface BeginFeatureInput {
  /** The user's feature request. */
  readonly description: string;
  /** `provider/model-id` pin for the author run, if any. */
  readonly modelLabel?: string | undefined;
  /** TUI completion callbacks, if any. */
  readonly hooks?: BeginFlowHooks | undefined;
}

/**
 * Begin a feature from the workspace: gate on the runs extension, snapshot
 * the features store, dispatch an author run through the pi-runs engine
 * with the authoring preprompt, and return its id. The run may park on
 * `ask_user` for the user to answer; on settle,
 * {@link featureAuthorCompletion} correlates the fresh feature to this
 * run's final reply. The run, not this flow, writes the spec.
 * @param root - workspace root (features store owner)
 * @param input - feature request, optional model pin, and completion hooks
 * @returns Effect resolving to the dispatched run id, failing with displayable message
 */
export const beginFeature = (
  root: string,
  input: BeginFeatureInput,
): Effect.Effect<{ readonly runId: string }, string> =>
  loadPiFeatures().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) => {
      const prompt = libs.Prompt.buildAuthorPrompt(input.description);
      return Effect.gen(function* () {
        const installed = yield* Runs.runsExtensionInstalled(root);
        if (!installed) return yield* Effect.fail(Runs.RUNS_EXTENSION_INSTALL_HINT);
        const beforeIds = yield* rawFeatureIds(root);
        const runId = yield* Runs.newRunId('author-feature');
        yield* Runs.startRun(root, {
          id: runId,
          name: `Author feature: ${input.description.trim().slice(0, 72)}`,
          prompt,
          model: input.modelLabel,
          tools: [...FEATURE_RUN_TOOLS],
          onSettled: featureAuthorCompletion(root, runId, beforeIds, input.hooks),
        });
        return { runId };
      });
    }),
  );
