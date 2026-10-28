import { Context, Data, Effect, FileSystem, Layer, Path } from 'effect';
import type { SpecFileEntry, SpecSnapshot } from '../../modules/structure/index.js';

/** Failure raised while reading spec directories. */
export class StoreError extends Data.TaggedError('@montflow/SpecStoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** Filesystem surface the CLI needs: list specs, snapshot one spec, write a new tree. */
export interface Impl {
  /** Spec directory names under `root`, sorted. Dotfiles skipped. */
  readonly names: (root: string) => Effect.Effect<ReadonlyArray<string>, StoreError>;
  /** True when `root` exists and is readable. */
  readonly hasRoot: (root: string) => Effect.Effect<boolean, never>;
  /** True when `root/<name>` exists. */
  readonly exists: (root: string, name: string) => Effect.Effect<boolean, never>;
  /** Every file and directory under `root/<name>`, as POSIX-relative entries. */
  readonly snapshot: (root: string, name: string) => Effect.Effect<SpecSnapshot, StoreError>;
  /**
   * Rename one entry inside a spec, creating the destination's parent directory.
   * Refuses an existing destination. Used by `migrate`.
   */
  readonly move: (
    root: string,
    name: string,
    from: string,
    to: string,
  ) => Effect.Effect<void, StoreError>;
  /**
   * Remove one empty directory inside a spec. Fails when it is not empty; used
   * by `migrate` to undo the phase directory a rolled-back move created.
   */
  readonly removeDirectory: (
    root: string,
    name: string,
    path: string,
  ) => Effect.Effect<void, StoreError>;
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
      const operation = 'SpecStore.names';
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

  const snapshot = (root: string, name: string): Effect.Effect<SpecSnapshot, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.snapshot';
      const dir = path.join(root, name);
      const entries = yield* fs
        .readDirectory(dir, { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation)));
      const files: Array<SpecFileEntry> = [];
      for (const entry of entries) {
        const absolute = path.join(dir, entry);
        const info = yield* fs.stat(absolute).pipe(Effect.mapError(toStoreError(operation)));
        if (info.type === 'Directory') {
          files.push({ path: toPosix(entry), content: '', kind: 'directory' });
          continue;
        }
        if (info.type !== 'File') continue;
        const content = yield* fs
          .readFileString(absolute)
          .pipe(Effect.mapError(toStoreError(operation)));
        files.push({ path: toPosix(entry), content, kind: 'file' });
      }
      return { name, files };
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
          .pipe(Effect.mapError(toStoreError(operation)));
        yield* fs
          .writeFileString(target, file.content)
          .pipe(Effect.mapError(toStoreError(operation)));
      }
    });

  const move = (
    root: string,
    name: string,
    from: string,
    to: string,
  ): Effect.Effect<void, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.move';
      const dir = path.join(root, name);
      const target = path.join(dir, to);
      if (yield* exists(dir, to)) {
        return yield* Effect.fail(
          new StoreError({
            operation,
            reason: `Cannot move '${from}': '${to}' already exists.`,
          }),
        );
      }
      yield* fs
        .makeDirectory(path.dirname(target), { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation)));
      yield* fs.rename(path.join(dir, from), target).pipe(Effect.mapError(toStoreError(operation)));
    });

  const removeDirectory = (
    root: string,
    name: string,
    target: string,
  ): Effect.Effect<void, StoreError> =>
    Effect.gen(function* () {
      const operation = 'SpecStore.removeDirectory';
      const absolute = path.join(root, name, target);
      const entries = yield* fs
        .readDirectory(absolute)
        .pipe(Effect.mapError(toStoreError(operation)));
      if (entries.length > 0) {
        return yield* Effect.fail(
          new StoreError({ operation, reason: `Directory '${target}' is not empty.` }),
        );
      }
      yield* fs
        .remove(absolute, { recursive: true })
        .pipe(Effect.mapError(toStoreError(operation)));
    });

  return { names, hasRoot, exists, snapshot, write, move, removeDirectory } as const;
});

export const Id = '@montflow/SpecStore';
export type Id = typeof Id;

/** Service implementation shape. */
export type Service = Effect.Success<typeof make>;

/** Spec directory reader. */
export class SpecStore extends Context.Service<SpecStore, Service>()(Id) {}

/** File-backed store; provide `NodeFileSystem` + `NodePath` at the composition root. */
export const Default = Layer.effect(SpecStore, make);
