// eslint-disable-next-line montflow/no-node-platform-imports -- platform adapter at the TUI composition-root boundary: specs live under .agents/@montflow/specs; migrate to FileSystem when the app moves onto the platform layer graph.
import { readdir, readFile, stat } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for spec files; both go away with the FileSystem migration.
import { join } from 'node:path';
import { Data, Effect } from 'effect';

/**
 * Lazy handles to the specs and reviews runtimes. Static imports are
 * type-only (erased at build) — the runtimes resolve here, on first use, never
 * at dashboard boot. A missing extension surfaces as a toast, not a crash.
 */
type SpecsLib = typeof import('@montflow/specs');
type ReviewsLib = typeof import('@montflow/reviews');

/** Failure loading the specs runtime. */
export class ExtensionLoadError extends Data.TaggedError('@montflow/SpecsExtensionLoadError')<{
  readonly message: string;
}> {}

/** Cached extension module promises. Cleared on failure so retrying reloads them. */
let cachedLib: Promise<SpecsLib> | undefined;
let cachedReviews: Promise<ReviewsLib> | undefined;

/** Test hook: drop the cached runtimes so the next load re-imports. */
export const resetExtensionCache = (): void => {
  cachedLib = undefined;
  cachedReviews = undefined;
};

/**
 * Load the specs runtime as an Effect, caching the module across
 * flows.
 * @returns Effect resolving to the extension module namespace
 */
export const loadSpecs = (): Effect.Effect<SpecsLib, ExtensionLoadError> =>
  Effect.tryPromise({
    try: () => {
      cachedLib ??= import('@montflow/specs').then(
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

/**
 * Load the reviews runtime, caching the module across flows. Used only to
 * read a round's `Phase:` attribution through its single-owner parser.
 * @returns a promise resolving to the reviews module namespace
 */
const loadReviews = async (): Promise<ReviewsLib> => {
  cachedReviews ??= import('@montflow/reviews').then(
    (libs) => libs,
    (cause: unknown) => {
      cachedReviews = undefined;
      throw cause;
    },
  );
  return cachedReviews;
};

/** One file inside a spec directory, POSIX-relative to the spec root. */
export interface SnapshotFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Absolute specs directory for a working directory:
 * `<cwd>/.agents/@montflow/specs`.
 * @param root - workspace root
 * @returns absolute specs directory
 */
export const specsDir = (root: string): string => join(root, '.agents', '@montflow', 'specs');

/** Absolute reviews directory for a working directory: `<cwd>/.agents/@montflow/reviews`. */
export const reviewsDir = (root: string): string => join(root, '.agents', '@montflow', 'reviews');

/** One round of a linked review series, with its phase attribution when set. */
export interface ReviewSeriesRound {
  /** Round directory name, e.g. `001`. */
  readonly round: string;
  /** The phase the round reviews (its `- Phase:` metadata), when set. */
  readonly phase?: string | undefined;
}

/** A spec's linked review series, as the review store lays it out. */
export interface ReviewSeries {
  /** Series directory name (`<spec>` or `<spec>-<profile>`). */
  readonly name: string;
  /** The series' rounds, each carrying its phase attribution when set. */
  readonly rounds: ReadonlyArray<ReviewSeriesRound>;
}

/**
 * Read the review series linked to a spec: the default series plus one per
 * declared reviewer profile, in declared order. Only three-digit round
 * directories count, so a stray `README.md` or a legacy `<code>.md` file never
 * masquerades as a round; each round's `Phase:` attribution is read through
 * `@montflow/reviews`' single-owner parser. A series directory that does not
 * exist is omitted, so the link verifier can tell "absent" from "present, no
 * round". Never fails on a missing series.
 * @param root - workspace root (review store owner)
 * @param name - spec directory slug
 * @param libs - loaded specs runtime (series naming)
 * @param files - the spec's files as read from disk (review-task profiles)
 * @returns the existing linked series, default first
 */
export const readReviewSeries = async (
  root: string,
  name: string,
  libs: SpecsLib,
  files: ReadonlyArray<SnapshotFile>,
): Promise<ReadonlyArray<ReviewSeries>> => {
  const reviews = await loadReviews();
  const profiles = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .flatMap((task) => (task === undefined || task.type !== 'review' ? [] : task.reviewerProfiles));
  const names = [...new Set(libs.ReviewLink.seriesNames(name, profiles))];
  const read = await Promise.all(
    names.map(async (series): Promise<ReviewSeries | undefined> => {
      const dir = join(reviewsDir(root), series);
      const entries = await readdir(dir).catch(() => undefined);
      if (entries === undefined) return undefined;
      const rounds = await Promise.all(
        entries
          .filter((entry) => reviews.Review.isValidRound(entry))
          .toSorted()
          .map(async (round): Promise<ReviewSeriesRound> => {
            const raw = await readFile(join(dir, round, reviews.Review.FILE_NAME), 'utf8').catch(
              () => undefined,
            );
            const phase =
              raw === undefined
                ? undefined
                : reviews.Review.parseRound(round, raw).metadata['Phase'];
            return phase === undefined || phase === '' ? { round } : { round, phase };
          }),
      );
      return { name: series, rounds };
    }),
  );
  return read.filter((series): series is ReviewSeries => series !== undefined);
};

/**
 * True when the specs directory exists.
 * @param root - workspace root
 * @returns installed flag, never fails
 */
export const specsInstalled = (root: string): Effect.Effect<boolean, never> =>
  Effect.promise(() =>
    stat(specsDir(root)).then(
      () => true,
      () => false,
    ),
  );

/** Read every file under one spec directory as POSIX-relative paths. */
const readSnapshot = async (root: string, name: string): Promise<ReadonlyArray<SnapshotFile>> => {
  const dir = join(specsDir(root), name);
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

/** One spec row for the dashboard list. */
export interface SpecSummary {
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
export type SpecCounts = Readonly<
  Record<'pending' | 'in-progress' | 'complete' | 'blocked', number>
>;

/** One task row inside a spec detail phase. */
export interface SpecTaskRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
}

/** One phase roll-up inside a spec detail. */
export interface SpecPhaseRow {
  readonly phase: string;
  readonly locked: boolean;
  readonly tasks: ReadonlyArray<SpecTaskRow>;
}

/** SPEC.md metadata for the detail header. */
export interface SpecMeta {
  readonly name: string;
  readonly status: string;
  readonly workspaceType: string;
  readonly author: string;
  readonly created: string;
  readonly lockedPhases: ReadonlyArray<string>;
  readonly description: string;
}

/** One verification issue shown in the detail. */
export interface SpecIssue {
  readonly field: string;
  readonly message: string;
}

/** Full spec detail: header metadata, per-phase tasks, and issues. */
export interface SpecDetail {
  readonly summary: SpecSummary;
  readonly meta: SpecMeta | undefined;
  readonly state: string;
  readonly counts: SpecCounts;
  readonly phases: ReadonlyArray<SpecPhaseRow>;
  readonly issues: ReadonlyArray<SpecIssue>;
}

/** Staged boot phase behind the specs-panel Loader. */
export type SpecsPhase = 'extension' | 'specs';

const EMPTY_COUNTS = {
  pending: 0,
  'in-progress': 0,
  complete: 0,
  blocked: 0,
} satisfies SpecCounts;

/** First non-empty line of the `## Description` section. */
const descriptionOf = (content: string): string => {
  const match = /^## Description\s*\n+([^\n#].*)$/m.exec(content);
  return match?.[1]?.trim() ?? '';
};

/** Phase prefix of a task id, e.g. `AA012` → `AA`. */
const phaseOf = (id: string): string => id.replace(/\d+$/, '');

/** Parsed pieces shared by the summary and the detail builders. */
const inspect = (
  libs: SpecsLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  review: ReadonlyArray<ReviewSeries>,
) => {
  const specFile = files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : libs.Spec.parseSpecFile(specFile.content);
  const tasks = files
    .filter((file) => file.path.endsWith('/TASK.md'))
    .map((file) => libs.Task.parseTaskFile(file.content))
    .filter((task) => task !== undefined);
  const verify = libs.Structure.verifySpecTree({ name: id, files }, review);
  const analysis =
    spec === undefined
      ? undefined
      : libs.Lifecycle.analyze({
          status: spec.status,
          lockedPhases: spec.lockedPhases,
          tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
          active: false,
        });
  return { spec, specFile, tasks, verify, analysis };
};

/** Bridge one spec directory into a dashboard row. Total by construction. */
const summarize = (
  libs: SpecsLib,
  id: string,
  files: ReadonlyArray<SnapshotFile>,
  review: ReadonlyArray<ReviewSeries>,
): SpecSummary => {
  const { spec, specFile, tasks, verify, analysis } = inspect(libs, id, files, review);
  return {
    id,
    name: spec?.name ?? id,
    description: descriptionOf(specFile?.content ?? '') || (spec?.name ?? id),
    state: analysis?.state ?? 'inconsistent',
    status: spec?.status ?? 'unknown',
    total: tasks.length,
    complete: tasks.filter((task) => task.status === 'complete').length,
    issues: verify.issues.length,
    valid: verify.valid,
  };
};

/** List every spec directory as a summary row, alphabetical. */
const readSpecs = async (root: string, libs: SpecsLib): Promise<ReadonlyArray<SpecSummary>> => {
  const dir = specsDir(root);
  const entries = await readdir(dir);
  const names = entries.filter((entry) => !entry.startsWith('.')).toSorted();
  const rows = await Promise.all(
    names.map(async (name): Promise<SpecSummary | undefined> => {
      const info = await stat(join(dir, name));
      if (!info.isDirectory()) return undefined;
      const files = await readSnapshot(root, name);
      const review = await readReviewSeries(root, name, libs, files);
      return summarize(libs, name, files, review);
    }),
  );
  return rows.filter((row): row is SpecSummary => row !== undefined);
};

/**
 * Spec rows for the TUI boot: load the extension runtime, then list
 * and verify every spec directory. A missing directory reads as an
 * empty list so the panel shows its empty note instead of an error.
 * @param root - workspace root (specs directory owner)
 * @returns Effect resolving to summary rows, failing with displayable message
 */
export const fetchSpecs = (root: string): Effect.Effect<ReadonlyArray<SpecSummary>, string> =>
  loadSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.tryPromise({
        try: () => readSpecs(root, libs),
        catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
      }),
    ),
    Effect.catch((error) =>
      error.includes('ENOENT') || error.includes('no such file')
        ? Effect.succeed<ReadonlyArray<SpecSummary>>([])
        : Effect.fail(error),
    ),
  );

/**
 * Load one spec for the detail page: header metadata, per-phase
 * tasks, verification issues, and the derived lifecycle state.
 * @param root - workspace root (specs directory owner)
 * @param id - spec directory name
 * @returns Effect resolving to the detail, failing with displayable message
 */
export const loadSpec = (root: string, id: string): Effect.Effect<SpecDetail, string> =>
  loadSpecs().pipe(
    Effect.mapError((error) => error.message),
    Effect.flatMap((libs) =>
      Effect.tryPromise({
        try: async (): Promise<SpecDetail> => {
          const files = await readSnapshot(root, id);
          const review = await readReviewSeries(root, id, libs, files);
          const { spec, specFile, tasks, verify, analysis } = inspect(libs, id, files, review);
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
            summary: summarize(libs, id, files, review),
            meta:
              spec === undefined
                ? undefined
                : {
                    name: spec.name,
                    status: spec.status,
                    workspaceType: spec.workspaceType,
                    author: spec.author,
                    created: spec.created,
                    lockedPhases: spec.lockedPhases,
                    description: descriptionOf(specFile?.content ?? ''),
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
