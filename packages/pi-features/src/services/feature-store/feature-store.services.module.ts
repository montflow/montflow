import { Context, Data, Effect, FileSystem, Layer, Path } from 'effect';
import type { FeatureFileEntry, FeatureSnapshot } from '../../modules/structure/index.js';

/** Failure raised while reading feature directories. */
export class StoreError extends Data.TaggedError('@montflow/FeatureStoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** Filesystem surface the CLI needs: list features, snapshot one feature. */
export interface Impl {
  /** Feature directory names under `root`, sorted. Dotfiles skipped. */
  readonly names: (root: string) => Effect.Effect<ReadonlyArray<string>, StoreError>;
  /** True when `root` exists and is readable. */
  readonly hasRoot: (root: string) => Effect.Effect<boolean, never>;
  /** True when `root/<name>` exists. */
  readonly exists: (root: string, name: string) => Effect.Effect<boolean, never>;
  /** Every file under `root/<name>`, as POSIX-relative paths + contents. */
  readonly snapshot: (root: string, name: string) => Effect.Effect<FeatureSnapshot, StoreError>;
}

const toStoreError =
  (operation: string) =>
  // `cause` is the rule's exempt name for error-cause enrichment.
  (cause: unknown): StoreError =>
    new StoreError({ operation, reason: cause instanceof Error ? cause.message : String(cause) });

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

  const names = (root: string): Effect.Effect<ReadonlyArray<string>, StoreError> =>
    Effect.gen(function* () {
      const operation = 'FeatureStore.names';
      const entries = yield* fs.readDirectory(root).pipe(Effect.mapError(toStoreError(operation)));
      const found: Array<string> = [];
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const info = yield* fs
          .stat(path.join(root, entry))
          .pipe(Effect.mapError(toStoreError(operation)));
        if (info.type === 'Directory') found.push(entry);
      }
      return found.toSorted();
    });

  const snapshot = (root: string, name: string): Effect.Effect<FeatureSnapshot, StoreError> =>
    Effect.gen(function* () {
      const operation = 'FeatureStore.snapshot';
      const dir = path.join(root, name);
      const entries = yield* fs
        .readDirectory(dir, { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation)));
      const files: Array<FeatureFileEntry> = [];
      for (const entry of entries) {
        const absolute = path.join(dir, entry);
        const info = yield* fs.stat(absolute).pipe(Effect.mapError(toStoreError(operation)));
        if (info.type !== 'File') continue;
        const content = yield* fs
          .readFileString(absolute)
          .pipe(Effect.mapError(toStoreError(operation)));
        files.push({ path: toPosix(entry), content });
      }
      return { name, files };
    });

  return { names, hasRoot, exists, snapshot } as const;
});

export const Id = '@montflow/FeatureStore';
export type Id = typeof Id;

/** Service implementation shape. */
export type Service = Effect.Success<typeof make>;

/** Feature directory reader. */
export class FeatureStore extends Context.Service<FeatureStore, Service>()(Id) {}

/** File-backed store; provide `NodeFileSystem` + `NodePath` at the composition root. */
export const Default = Layer.effect(FeatureStore, make);
