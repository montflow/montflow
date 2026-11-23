import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Extension from '../../modules/extension/index.js';
import * as Principle from '../../modules/principle/index.js';
import { MarkdownStore } from '../markdown-store/index.js';

/** Failure when the principle store or one of its files cannot be read. */
export class StoreError extends Schema.TaggedError<StoreError>()('PrincipleStore.StoreError', {
  message: Schema.String,
}) {}

/** One principle file, undecoded. */
export type RawEntry = Extension.RawEntry;

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const read = (root: string, dir: ReadonlyArray<string>) =>
    MarkdownStore.readEntries(fs, path, path.join(root, ...dir), Principle.FILE).pipe(
      Effect.mapError((message) => new StoreError({ message })),
    );

  /**
   * Every directory in the shipped store,
   * `<root>/.agents/@montflow/principles`, undecoded and name-sorted, so
   * `verify` can report a corrupt file instead of missing it. A missing store
   * is an empty list.
   * @param root - workspace root
   * @returns every shipped entry's name and raw contents
   */
  const readAllRaw = Effect.fn('PrincipleStore.readAllRaw')(function* (root: string) {
    return yield* read(root, Principle.STORE_DIR);
  });

  /**
   * Every directory in the repo's extension store,
   * `<root>/.agents/@montflow/mf-mode/extensions/principles`, read the same
   * way as the shipped store.
   * @param root - workspace root
   * @returns every extension entry's name and raw contents
   */
  const readExtensionsRaw = Effect.fn('PrincipleStore.readExtensionsRaw')(function* (root: string) {
    return yield* read(root, Principle.EXTENSION_DIR);
  });

  /**
   * What a reader sees: each extension over the shipped entry of its name.
   * @param root - workspace root
   * @returns the resolved entries, name-sorted, and the extensions that did not resolve
   */
  const resolve = Effect.fn('PrincipleStore.resolve')(function* (root: string) {
    const [shipped, extensions] = yield* Effect.all([readAllRaw(root), readExtensionsRaw(root)]);
    return Extension.resolve(shipped, extensions, Principle.KIND);
  });

  return { readAllRaw, readExtensionsRaw, resolve } as const;
});

export const Id = '@montflow/PrincipleStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PrincipleStore extends Context.Service<PrincipleStore, Impl>()(Id) {}

export const Default = Layer.effect(PrincipleStore, make);
