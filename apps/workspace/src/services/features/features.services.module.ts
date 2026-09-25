// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: features live under .agents/@montflow/features; migrate to FileSystem when the app moves onto the platform layer graph.
import { readdir, readFile, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for feature files; both go away with the FileSystem migration.
import { join } from 'node:path';
import { Data, Effect } from 'effect';

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
const inspect = (libs: PiFeaturesLib, id: string, files: ReadonlyArray<SnapshotFile>) => {
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
        });
  return { feature, featureFile, tasks, verify, analysis };
};

/** Bridge one feature directory into a dashboard row. Total by construction. */
const summarize = (
  libs: PiFeaturesLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
): FeatureSummary => {
  const { feature, featureFile, tasks, verify, analysis } = inspect(libs, id, files);
  return {
    id,
    name: feature?.name ?? id,
    description: descriptionOf(featureFile?.content ?? '') || (feature?.name ?? id),
    state: analysis?.state ?? 'inconsistent',
    status: feature?.status ?? 'unknown',
    total: tasks.length,
    complete: tasks.filter((task) => task.status === 'complete').length,
    issues: verify.issues.length,
    valid: verify.valid,
  };
};

/** List every feature directory as a summary row, alphabetical. */
const readFeatures = async (
  root: string,
  libs: PiFeaturesLib,
): Promise<ReadonlyArray<FeatureSummary>> => {
  const dir = featuresDir(root);
  const entries = await readdir(dir);
  const names = entries.filter((entry) => !entry.startsWith('.')).toSorted();
  const rows = await Promise.all(
    names.map(async (name): Promise<FeatureSummary | undefined> => {
      const info = await stat(join(dir, name));
      if (!info.isDirectory()) return undefined;
      return summarize(libs, name, await readSnapshot(root, name));
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
      Effect.tryPromise({
        try: () => readFeatures(root, libs),
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
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
      Effect.tryPromise({
        try: async (): Promise<FeatureDetail> => {
          const files = await readSnapshot(root, id);
          const { feature, featureFile, tasks, verify, analysis } = inspect(libs, id, files);
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
            summary: summarize(libs, id, files),
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
      }),
    ),
  );
