import { Context, Data, Effect, FileSystem, Layer, Path } from 'effect';
import * as Review from '../../modules/review/index.js';

/** Failure when a review file cannot be read or written. */
export class StoreError extends Data.TaggedError('ReviewStore.StoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** Store directory segments under a working directory. */
const REVIEWS_SEGMENTS = ['.agents', '@montflow', 'reviews'] as const;

/** Reviews root for a working directory. */
const reviewsDir = (path: Path.Path, cwd: string): string => path.join(cwd, ...REVIEWS_SEGMENTS);

/**
 * Directory the store reads/writes. An explicit `dir` wins (resolved against
 * `cwd`), so callers can target a folder other than the default
 * `<cwd>/.agents/@montflow/reviews`.
 * @param path - Path service
 * @param cwd - working directory
 * @param dir - explicit store directory, if any
 * @returns absolute store directory
 */
const storeDir = (path: Path.Path, cwd: string, dir: string | undefined): string =>
  dir === undefined || dir === '' ? reviewsDir(path, cwd) : path.resolve(cwd, dir);

/** Immediate subdirectory names under `dir`, sorted; empty when unreadable. */
const subdirectories = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<ReadonlyArray<string>, StoreError> =>
  Effect.gen(function* () {
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'list', reason: `Cannot read '${dir}'.` }),
        ),
      );
    const directories: Array<string> = [];
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const info = yield* fs
        .stat(path.join(dir, entry))
        .pipe(Effect.orElseSucceed(() => undefined));
      if (info !== undefined && info.type === 'Directory') directories.push(entry);
    }
    return directories.toSorted();
  }).pipe(
    // SAFETY: an unreadable directory is an absent group, not a store failure.
    Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
  );

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /** Every series directory name under the store root, sorted. */
  const seriesNames = Effect.fn('ReviewStore.seriesNames')(function* (cwd: string, dir?: string) {
    return yield* subdirectories(fs, path, storeDir(path, cwd, dir));
  });

  /** Every round directory name under one series, sorted. */
  const roundNames = Effect.fn('ReviewStore.roundNames')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    const seriesDir = path.join(storeDir(path, cwd, dir), name);
    return yield* subdirectories(fs, path, seriesDir);
  });

  /** Read a series ledger, failing with a message that names the series. */
  const readSeries = Effect.fn('ReviewStore.readSeries')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    const file = path.join(storeDir(path, cwd, dir), name, Review.FILE_NAME);
    return yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'read', reason: `No review series '${name}'.` }),
        ),
      );
  });

  /** Read one round file, failing with a message that names the round. */
  const readRound = Effect.fn('ReviewStore.readRound')(function* (
    cwd: string,
    name: string,
    round: string,
    dir?: string,
  ) {
    const file = path.join(storeDir(path, cwd, dir), name, round, Review.FILE_NAME);
    return yield* fs.readFileString(file).pipe(
      Effect.mapError(
        () =>
          new StoreError({
            operation: 'read',
            reason: `No round '${round}' in review series '${name}'.`,
          }),
      ),
    );
  });

  /** Write a series ledger, creating the directory tree as needed. */
  const saveSeries = Effect.fn('ReviewStore.saveSeries')(function* (
    cwd: string,
    name: string,
    text: string,
    dir?: string,
  ) {
    const seriesDir = path.join(storeDir(path, cwd, dir), name);
    yield* fs.makeDirectory(seriesDir, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot create '${seriesDir}': ${cause.message}`,
          }),
      ),
    );
    const file = path.join(seriesDir, Review.FILE_NAME);
    yield* fs.writeFileString(file, text).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot write '${file}': ${cause.message}`,
          }),
      ),
    );
  });

  /** Write one round file, creating the directory tree as needed. */
  const saveRound = Effect.fn('ReviewStore.saveRound')(function* (
    cwd: string,
    name: string,
    round: string,
    text: string,
    dir?: string,
  ) {
    const roundDir = path.join(storeDir(path, cwd, dir), name, round);
    yield* fs.makeDirectory(roundDir, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot create '${roundDir}': ${cause.message}`,
          }),
      ),
    );
    const file = path.join(roundDir, Review.FILE_NAME);
    yield* fs.writeFileString(file, text).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot write '${file}': ${cause.message}`,
          }),
      ),
    );
  });

  return { seriesNames, roundNames, readSeries, readRound, saveSeries, saveRound } as const;
});

export const Id = '@montflow/ReviewStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class ReviewStore extends Context.Service<ReviewStore, Impl>()(Id) {}

export const Default = Layer.effect(ReviewStore, make);
