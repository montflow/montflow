import { Context, Data, Effect, FileSystem, Layer, Path, Predicate } from 'effect';
import {
  type SeriesRoundSnapshot,
  type SeriesSnapshot,
  roundPhase,
} from '../../modules/review-link/index.js';
import type { SpecFileEntry, SpecSnapshot } from '../../modules/structure/index.js';

/** Failure raised while reading spec directories. */
export class StoreError extends Data.TaggedError('@montflow/SpecStoreError')<{
  readonly operation: string;
  readonly reason: string;
  /** File the failure concerns, when it concerns one. */
  readonly path?: string;
  /**
   * Store the failure belongs to, when it is not the spec's own directory.
   * `reviews` marks the review store beside the specs store, so the CLI can
   * render a repo-relative path and a repair for it instead of a spec file.
   */
  readonly origin?: 'reviews';
  /** The original platform failure, preserved for the CLI's cause chain. */
  readonly cause?: unknown;
}> {}

/** Filesystem surface the CLI needs: list specs, snapshot one spec, write a new tree. */
export interface Impl {
  /** Spec directory names under `root`, sorted. Dotfiles skipped. */
  readonly names: (root: string) => Effect.Effect<ReadonlyArray<string>, StoreError>;
  /** True when `root` exists and is readable. */
  readonly hasRoot: (root: string) => Effect.Effect<boolean, never>;
  /** True when `root/<name>` exists. */
  readonly exists: (root: string, name: string) => Effect.Effect<boolean, never>;
  /** True when `root/<name>/<relative>` exists, without reading the whole spec. */
  readonly hasFile: (root: string, name: string, relative: string) => Effect.Effect<boolean, never>;
  /** Every file under `root/<name>`, as POSIX-relative paths + contents. */
  readonly snapshot: (root: string, name: string) => Effect.Effect<SpecSnapshot, StoreError>;
  /**
   * Rounds of every review series linked to `root/<name>`, read from the review
   * store beside the specs store (`<specs-root>/../reviews`). A series is linked
   * when it is named `<name>` or `<name>-<profile>`. A missing reviews
   * directory yields no series, and a round directory without `REVIEW.md` is
   * skipped; any unreadable directory or round file fails with `origin:
   * 'reviews'`, so a silent skip never hides a budget check.
   */
  readonly reviewSeries: (
    root: string,
    name: string,
  ) => Effect.Effect<ReadonlyArray<SeriesSnapshot>, StoreError>;
  /**
   * Read one file directly under `root` (a root config, never a spec). Reads
   * as `undefined` when the file is absent, so an optional root file never
   * fails the call.
   */
  readonly readRootFile: (
    root: string,
    name: string,
  ) => Effect.Effect<string | undefined, StoreError>;
  /**
   * Write a fresh spec tree under `root/<name>`, creating `root` and every
   * parent directory. `files` carry POSIX-relative paths; an existing file is
   * overwritten.
   */
  readonly write: (
    root: string,
    name: string,
    files: ReadonlyArray<SpecFileEntry>,
  ) => Effect.Effect<void, StoreError>;
}

const toStoreError =
  (operation: string, target?: string) =>
  // `cause` is the rule's exempt name for error-cause enrichment.
  (cause: unknown): StoreError => {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return target === undefined
      ? new StoreError({ operation, reason, cause })
      : new StoreError({ operation, reason, cause, path: target });
  };

/** True when a platform failure is the absence of a path, not a denial. */
const isNotFound = (cause: unknown): boolean =>
  Predicate.hasProperty(cause, 'reason') && Predicate.isTagged(cause.reason, 'NotFound');

/**
 * The platform failure's operation without its absolute path argument, e.g.
 * `PermissionDenied: FileSystem.readFile`. The review store renders
 * repo-relative output, so the path belongs in `cause`, not in `problem`.
 */
const platformDetail = (cause: unknown): string => {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const pathStart = raw.indexOf(' (');
  return pathStart === -1 ? raw : raw.slice(0, pathStart);
};

/**
 * Map a review-store failure: unlike a spec file, the review store lives
 * outside the spec directory, so the message names the entry relative to the
 * store's parent instead of leaking a machine-absolute path, and `origin` lets
 * the CLI render the right path and repair.
 */
const toReviewError =
  (operation: string, relative: string, target: string) =>
  (cause: unknown): StoreError =>
    new StoreError({
      operation,
      reason: `Cannot read the review store entry '${relative}': ${platformDetail(cause)}.`,
      path: target,
      origin: 'reviews',
      cause,
    });

/** Normalize platform path separators to POSIX for stable snapshot keys. */
const toPosix = (value: string): string => value.split('\\').join('/');

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const hasRoot = (root: string): Effect.Effect<boolean, never> =>
    fs.access(root).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(false),
        onSuccess: () => Effect.succeed(true),
      }),
    );

  const exists = (root: string, name: string): Effect.Effect<boolean, never> =>
    fs.access(path.join(root, name)).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(false),
        onSuccess: () => Effect.succeed(true),
      }),
    );

  const hasFile = (root: string, name: string, relative: string): Effect.Effect<boolean, never> =>
    fs.access(path.join(root, name, relative)).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(false),
        onSuccess: () => Effect.succeed(true),
      }),
    );

  const names = (root: string): Effect.Effect<ReadonlyArray<string>, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.names';
      const entries = yield* fs
        .readDirectory(root)
        .pipe(Effect.mapError(toStoreError(operation, root)));
      const found: Array<string> = [];
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const info = yield* fs
          .stat(path.join(root, entry))
          .pipe(Effect.mapError(toStoreError(operation, path.join(root, entry))));
        if (info.type === 'Directory') found.push(entry);
      }
      return found.toSorted();
    });

  const snapshot = (root: string, name: string): Effect.Effect<SpecSnapshot, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.snapshot';
      const dir = path.join(root, name);
      const entries = yield* fs
        .readDirectory(dir, { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation, dir)));
      const files: Array<SpecFileEntry> = [];
      for (const entry of entries) {
        const absolute = path.join(dir, entry);
        const info = yield* fs
          .stat(absolute)
          .pipe(Effect.mapError(toStoreError(operation, absolute)));
        if (info.type !== 'File') continue;
        const content = yield* fs
          .readFileString(absolute)
          .pipe(Effect.mapError(toStoreError(operation, absolute)));
        files.push({ path: toPosix(entry), content });
      }
      return { name, files };
    });

  const readRootFile = (
    root: string,
    name: string,
  ): Effect.Effect<string | undefined, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.readRootFile';
      const target = path.join(root, name);
      const present = yield* fs.access(target).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(false),
          onSuccess: () => Effect.succeed(true),
        }),
      );
      if (!present) return undefined;
      return yield* fs
        .readFileString(target)
        .pipe(Effect.mapError(toStoreError(operation, target)));
    });

  const reviewSeries = (
    root: string,
    name: string,
  ): Effect.Effect<ReadonlyArray<SeriesSnapshot>, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.reviewSeries';
      const reviewsRoot = path.join(path.dirname(root), 'reviews');
      const storeParent = path.dirname(reviewsRoot);
      const fail = (target: string) =>
        toReviewError(operation, path.relative(storeParent, target), target);
      // Only a missing store is "no series". A permission or mount failure is
      // a failed read, so an unreadable store can never hide a budget check.
      const reviewsStat = yield* fs.stat(reviewsRoot).pipe(
        Effect.matchEffect({
          onFailure: (cause) =>
            isNotFound(cause) ? Effect.succeed(undefined) : Effect.fail(fail(reviewsRoot)(cause)),
          onSuccess: (info) => Effect.succeed(info),
        }),
      );
      if (reviewsStat === undefined) return [];
      if (reviewsStat.type !== 'Directory')
        return yield* Effect.fail(
          fail(reviewsRoot)(new Error('the review store is not a directory')),
        );
      const entries = yield* fs.readDirectory(reviewsRoot).pipe(Effect.mapError(fail(reviewsRoot)));
      const series: Array<SeriesSnapshot> = [];
      for (const entry of entries.toSorted()) {
        if (entry !== name && !entry.startsWith(`${name}-`)) continue;
        const dir = path.join(reviewsRoot, entry);
        const info = yield* fs.stat(dir).pipe(Effect.mapError(fail(dir)));
        if (info.type !== 'Directory') continue;
        const roundNames = yield* fs.readDirectory(dir).pipe(Effect.mapError(fail(dir)));
        const rounds: Array<SeriesRoundSnapshot> = [];
        for (const round of roundNames.toSorted()) {
          // Only a directory is a round; the series ledger (`REVIEW.md`) and
          // any other file beside the rounds are not.
          const roundDir = path.join(dir, round);
          const roundInfo = yield* fs.stat(roundDir).pipe(
            Effect.matchEffect({
              onFailure: (cause) =>
                isNotFound(cause) ? Effect.succeed(undefined) : Effect.fail(fail(roundDir)(cause)),
              onSuccess: (found) => Effect.succeed(found),
            }),
          );
          if (roundInfo === undefined || roundInfo.type !== 'Directory') continue;
          const target = path.join(roundDir, 'REVIEW.md');
          // A round directory without a REVIEW.md is absent, not unreadable;
          // an existing one that cannot be read fails the call.
          const roundStat = yield* fs.stat(target).pipe(
            Effect.matchEffect({
              onFailure: (cause) =>
                isNotFound(cause) ? Effect.succeed(undefined) : Effect.fail(fail(target)(cause)),
              onSuccess: (found) => Effect.succeed(found),
            }),
          );
          if (roundStat === undefined || roundStat.type !== 'File') continue;
          const text = yield* fs.readFileString(target).pipe(Effect.mapError(fail(target)));
          const phase = roundPhase(text);
          rounds.push(phase === undefined ? { round } : { round, phase });
        }
        series.push({ name: entry, rounds });
      }
      return series;
    });

  const write = (
    root: string,
    name: string,
    files: ReadonlyArray<SpecFileEntry>,
  ): Effect.Effect<void, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.write';
      const dir = path.join(root, name);
      for (const file of files) {
        const target = path.join(dir, file.path);
        yield* fs
          .makeDirectory(path.dirname(target), { recursive: true })
          .pipe(Effect.mapError(toStoreError(operation, path.dirname(target))));
        yield* fs
          .writeFileString(target, file.content)
          .pipe(Effect.mapError(toStoreError(operation, target)));
      }
    });

  return { names, hasRoot, exists, hasFile, snapshot, reviewSeries, readRootFile, write } as const;
});

export const Id = '@montflow/SpecStore';
export type Id = typeof Id;

/** Service implementation shape. */
export type Service = Effect.Success<typeof make>;

/** Spec directory reader. */
export class SpecStore extends Context.Service<SpecStore, Service>()(Id) {}

/** File-backed store; provide `NodeFileSystem` + `NodePath` at the composition root. */
export const Default = Layer.effect(SpecStore, make);
