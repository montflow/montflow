import { Context, Data, Effect, FileSystem, Layer, Path } from 'effect';
import * as Reference from '../../modules/reference/index.js';
import type { StoreSnapshot } from '../../modules/verifier/index.js';

/** Failure when a store entry cannot be read or written. */
export class StoreError extends Data.TaggedError('ReferenceStore.StoreError')<{
  readonly operation: string;
  readonly reason: string;
}> {}

/** Absolute store directory for a workspace root. */
const storeDir = (path: Path.Path, root: string): string => path.join(root, Reference.STORE_DIR);

/** True when a name can never be a direct child entry directory. */
const invalidEntryName = (slug: string): boolean =>
  slug === '' ||
  slug === '.' ||
  slug === '..' ||
  slug.length > 64 ||
  slug.includes('/') ||
  slug.includes('\\') ||
  !Reference.isValidName(slug);

/**
 * Absolute entry directory for one slug, or undefined when the name is not a
 * slug. Defence in depth behind the CLI guards: the resolved path must be a
 * direct child of the store root, so `..`, separators, and absolute spellings
 * can never escape it.
 */
const entryDir = (path: Path.Path, root: string, slug: string): string | undefined => {
  if (invalidEntryName(slug)) return undefined;
  const base = storeDir(path, root);
  const dir = path.join(base, slug);
  const relative = path.relative(base, dir);
  if (relative !== slug || path.isAbsolute(relative)) return undefined;
  return dir;
};

/** True when `path` is a symbolic link; never fails. */
const isSymlink = (fs: FileSystem.FileSystem, target: string): Effect.Effect<boolean> =>
  fs.readLink(target).pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  );

/** Fail with the store's invalid-name error for one unsafe slug. */
const requireEntryDir = (
  path: Path.Path,
  root: string,
  slug: string,
  operation: string,
): Effect.Effect<string, StoreError> => {
  const dir = entryDir(path, root, slug);
  return dir === undefined
    ? Effect.fail(new StoreError({ operation, reason: `Invalid reference name '${slug}'.` }))
    : Effect.succeed(dir);
};

/** Fail when a checked entry directory is a symlink (it may point anywhere). */
const requireRealDirectory = (
  fs: FileSystem.FileSystem,
  dir: string,
  slug: string,
  operation: string,
): Effect.Effect<void, StoreError> =>
  Effect.gen(function* () {
    if (yield* isSymlink(fs, dir)) {
      return yield* Effect.fail(
        new StoreError({
          operation,
          reason: `Reference '${slug}' is a symlink; store entries must be real directories.`,
        }),
      );
    }
    return undefined;
  });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /** Every entry slug under the store root, sorted; a missing root is empty. */
  const list = Effect.fn('ReferenceStore.list')(function* (root: string) {
    const dir = storeDir(path, root);
    const present = yield* fs.exists(dir);
    if (!present) {
      const missing: ReadonlyArray<string> = [];
      return missing;
    }
    const names = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'list', reason: `Cannot read '${dir}'.` }),
        ),
      );
    const slugs: Array<string> = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const target = path.join(dir, name);
      if (yield* isSymlink(fs, target)) continue;
      const info = yield* fs.stat(target).pipe(Effect.orElseSucceed(() => undefined));
      if (info !== undefined && info.type === 'Directory') slugs.push(name);
    }
    return slugs.toSorted();
  });

  /** Every non-dot sibling name, used only as the collision universe for `add`. */
  const names = Effect.fn('ReferenceStore.names')(function* (root: string) {
    const dir = storeDir(path, root);
    const present = yield* fs.exists(dir);
    if (!present) {
      const missing: ReadonlyArray<string> = [];
      return missing;
    }
    const found = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'names', reason: `Cannot read '${dir}'.` }),
        ),
      );
    return found.filter((name) => !name.startsWith('.')).toSorted();
  });

  /** True when one entry directory itself exists (decoding is irrelevant). */
  const entryExists = Effect.fn('ReferenceStore.entryExists')(function* (
    root: string,
    slug: string,
  ) {
    const dir = yield* requireEntryDir(path, root, slug, 'exists');
    return yield* fs.exists(dir);
  });

  /** One scanned store root, including raw bytes and unexpected sibling files. */
  const scan = Effect.fn('ReferenceStore.scan')(function* (root: string) {
    const dir = storeDir(path, root);
    const present = yield* fs.exists(dir);
    if (!present) {
      const missing: StoreSnapshot = { present: false, entries: [] };
      return missing;
    }
    const children = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'scan', reason: `Cannot read '${dir}'.` }),
        ),
      );
    const entries: Array<StoreSnapshot['entries'][number]> = [];
    for (const name of children.toSorted()) {
      if (name.startsWith('.')) continue;
      const oneDir = path.join(dir, name);
      if (yield* isSymlink(fs, oneDir)) continue;
      const info = yield* fs.stat(oneDir).pipe(Effect.orElseSucceed(() => undefined));
      if (info === undefined || info.type !== 'Directory') continue;
      const files = yield* fs.readDirectory(oneDir).pipe(
        Effect.orElseSucceed(() => {
          const empty: ReadonlyArray<string> = [];
          return empty;
        }),
      );
      const raw = files.includes(Reference.ENTRY_FILE)
        ? yield* fs.readFileString(path.join(oneDir, Reference.ENTRY_FILE)).pipe(
            Effect.mapError(
              (cause) =>
                new StoreError({
                  operation: 'read',
                  reason: `Cannot read '${Reference.entryPath(name)}': ${cause.message}`,
                }),
            ),
          )
        : undefined;
      const extraFiles = files
        .filter((file) => file !== Reference.ENTRY_FILE && !file.startsWith('.'))
        .toSorted();
      entries.push({ slug: name, raw, extraFiles });
    }
    const snapshot: StoreSnapshot = { present: true, entries };
    return snapshot;
  });

  /** Raw `REFERENCE.md` bytes for one entry. */
  const readRaw = Effect.fn('ReferenceStore.readRaw')(function* (root: string, slug: string) {
    const dir = yield* requireEntryDir(path, root, slug, 'read');
    yield* requireRealDirectory(fs, dir, slug, 'read');
    const file = path.join(dir, Reference.ENTRY_FILE);
    return yield* fs
      .readFileString(file)
      .pipe(
        Effect.mapError(
          () => new StoreError({ operation: 'read', reason: `No reference '${slug}'.` }),
        ),
      );
  });

  /** One decoded entry; the body is available through {@link readRaw}. */
  const readOne = Effect.fn('ReferenceStore.readOne')(function* (root: string, slug: string) {
    const raw = yield* readRaw(root, slug);
    const document = Reference.decodeReferenceFile(raw);
    if (document === undefined) {
      return yield* Effect.fail(
        new StoreError({
          operation: 'read',
          reason: `Reference '${slug}' is not a valid ${Reference.ENTRY_FILE}.`,
        }),
      );
    }
    return document.reference;
  });

  /** Write one entry in canonical form, creating the store tree as needed. */
  const write = Effect.fn('ReferenceStore.write')(function* (
    root: string,
    reference: Reference.Reference,
    body: string,
  ) {
    const dir = yield* requireEntryDir(path, root, reference.name, 'write');
    yield* requireRealDirectory(fs, dir, reference.name, 'write');
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot create '${dir}': ${cause.message}`,
          }),
      ),
    );
    const file = path.join(dir, Reference.ENTRY_FILE);
    const temporary = path.join(dir, '.REFERENCE.md.tmp');
    const markdown = Reference.encodeReferenceFile({ reference, body });
    yield* fs.writeFileString(temporary, markdown).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot write '${file}': ${cause.message}`,
          }),
      ),
    );
    yield* fs.rename(temporary, file).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'write',
            reason: `Cannot write '${file}': ${cause.message}`,
          }),
      ),
    );
  });

  /** Remove one entry directory; a missing entry is a failure. */
  const remove = Effect.fn('ReferenceStore.remove')(function* (root: string, slug: string) {
    const dir = yield* requireEntryDir(path, root, slug, 'remove');
    if (yield* isSymlink(fs, dir)) {
      return yield* Effect.fail(
        new StoreError({
          operation: 'remove',
          reason: `Reference '${slug}' is a symlink; refusing to remove it.`,
        }),
      );
    }
    const info = yield* fs.stat(dir).pipe(Effect.orElseSucceed(() => undefined));
    if (info === undefined) {
      return yield* Effect.fail(
        new StoreError({ operation: 'remove', reason: `No reference '${slug}'.` }),
      );
    }
    if (info.type !== 'Directory') {
      return yield* Effect.fail(
        new StoreError({
          operation: 'remove',
          reason: `Reference '${slug}' is not a directory; refusing to remove it.`,
        }),
      );
    }
    yield* fs.remove(dir, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new StoreError({
            operation: 'remove',
            reason: `Cannot remove '${dir}': ${cause.message}`,
          }),
      ),
    );
  });

  /** True when one entry's `REFERENCE.md` exists in a real (non-symlink) directory. */
  const exists = Effect.fn('ReferenceStore.exists')(function* (root: string, slug: string) {
    const dir = yield* requireEntryDir(path, root, slug, 'read');
    yield* requireRealDirectory(fs, dir, slug, 'read');
    const file = path.join(dir, Reference.ENTRY_FILE);
    return yield* fs.exists(file);
  });

  return { list, names, entryExists, scan, readRaw, readOne, write, remove, exists } as const;
});

export const Id = '@montflow/ReferenceStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class ReferenceStore extends Context.Service<ReferenceStore, Impl>()(Id) {}

export const Default = Layer.effect(ReferenceStore, make);
