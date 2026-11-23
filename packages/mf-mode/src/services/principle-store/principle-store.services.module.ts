import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Principle from '../../modules/principle/index.js';

/** Failure when the principle store or one of its files cannot be read. */
export class StoreError extends Schema.TaggedError<StoreError>()('PrincipleStore.StoreError', {
  message: Schema.String,
}) {}

/** One principle file, undecoded. */
export interface RawEntry {
  readonly name: string;
  readonly raw: string;
}

/** Principles root for a workspace: `<root>/.agents/@montflow/principles`. */
const storeRoot = (path: Path.Path, root: string): string =>
  path.join(root, ...Principle.STORE_DIR);

/** The entries of a store that does not exist yet. */
const EMPTY: ReadonlyArray<RawEntry> = [];

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /**
   * Every directory in the store as `{ name, raw }`, without decoding, so
   * `verify` can report a corrupt file instead of missing it. A directory
   * with no readable `PRINCIPLE.md` yields empty bytes, which verification
   * rejects. A missing store is an empty list.
   * @param root - workspace root
   * @returns every entry's name and raw contents, name-sorted
   */
  const readAllRaw = Effect.fn('PrincipleStore.readAllRaw')(function* (root: string) {
    const dir = storeRoot(path, root);
    const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return EMPTY;
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          (cause) => new StoreError({ message: `Cannot read '${dir}': ${cause.message}` }),
        ),
      );
    const directories = yield* Effect.forEach(entries.toSorted(), (entry) =>
      fs.stat(path.join(dir, entry)).pipe(
        Effect.map((info) => (info.type === 'Directory' ? entry : undefined)),
        Effect.orElseSucceed(() => undefined),
      ),
    );
    const names = directories.filter((entry): entry is string => entry !== undefined);
    return yield* Effect.forEach(names, (name): Effect.Effect<RawEntry> =>
      fs.readFileString(path.join(dir, name, Principle.FILE)).pipe(
        Effect.map((raw) => ({ name, raw })),
        Effect.orElseSucceed(() => ({ name, raw: '' })),
      ),
    );
  });

  /**
   * Every principle that decodes, name-sorted. A file that does not decode is
   * left to `verify`.
   * @param root - workspace root
   * @returns the decoded principles
   */
  const list = Effect.fn('PrincipleStore.list')(function* (root: string) {
    const raws = yield* readAllRaw(root);
    const decoded = yield* Effect.forEach(raws, ({ name, raw }) =>
      Principle.decodeFile(name, raw).pipe(Effect.orElseSucceed(() => undefined)),
    );
    return decoded.filter((principle): principle is Principle.Principle => principle !== undefined);
  });

  /**
   * One principle's file bytes, unchanged.
   * @param root - workspace root
   * @param name - principle slug
   * @returns the raw contents, failing when the name is not in the store
   */
  const readRaw = Effect.fn('PrincipleStore.readRaw')(function* (root: string, name: string) {
    if (!Principle.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown principle '${name}'.` }));
    }
    return yield* fs
      .readFileString(path.join(storeRoot(path, root), name, Principle.FILE))
      .pipe(Effect.mapError(() => new StoreError({ message: `Unknown principle '${name}'.` })));
  });

  return { readAllRaw, list, readRaw } as const;
});

export const Id = '@montflow/PrincipleStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PrincipleStore extends Context.Service<PrincipleStore, Impl>()(Id) {}

export const Default = Layer.effect(PrincipleStore, make);
