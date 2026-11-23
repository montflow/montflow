import { Effect, type FileSystem, type Path } from 'effect';
import type { RawEntry } from '../../modules/extension/index.js';

/**
 * The directory reads the principle and playbook stores share: one directory
 * per entry, each holding one markdown file. Every store, shipped or extension,
 * is read the same way, so a missing store is empty in both.
 */

/** The entries of a store that does not exist yet. */
const EMPTY: ReadonlyArray<RawEntry> = [];

/**
 * Every directory in a store as `{ name, raw }`, without decoding, so
 * `verify` can report a corrupt file instead of missing it. A directory with
 * no readable entry file yields empty bytes, which verification rejects. A
 * missing store is an empty list.
 * @param fs - file system
 * @param path - path helpers
 * @param dir - store directory
 * @param file - the file each entry directory holds
 * @returns every entry's name and raw contents, name-sorted, failing with a message when the store cannot be listed
 */
export const readEntries = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  file: string,
): Effect.Effect<ReadonlyArray<RawEntry>, string> =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return EMPTY;
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(Effect.mapError((cause) => `Cannot read '${dir}': ${cause.message}`));
    const directories = yield* Effect.forEach(entries.toSorted(), (entry) =>
      fs.stat(path.join(dir, entry)).pipe(
        Effect.map((info) => (info.type === 'Directory' ? entry : undefined)),
        Effect.orElseSucceed(() => undefined),
      ),
    );
    const names = directories.filter((entry): entry is string => entry !== undefined);
    return yield* Effect.forEach(names, (name): Effect.Effect<RawEntry> =>
      fs.readFileString(path.join(dir, name, file)).pipe(
        Effect.map((raw) => ({ name, raw })),
        Effect.orElseSucceed(() => ({ name, raw: '' })),
      ),
    );
  });

/**
 * Names of the directories under any of `dirs` that hold `file`. A missing
 * store holds none.
 * @param fs - file system
 * @param path - path helpers
 * @param dirs - store directories, read together
 * @param file - the file an entry directory must hold
 * @returns the entry names across every store
 */
export const entryNames = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dirs: ReadonlyArray<string>,
  file: string,
): Effect.Effect<ReadonlySet<string>> =>
  Effect.forEach(dirs, (dir) =>
    fs.readDirectory(dir).pipe(
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
      Effect.flatMap((entries) =>
        Effect.forEach(entries, (entry) =>
          fs.exists(path.join(dir, entry, file)).pipe(
            Effect.map((present) => (present ? entry : undefined)),
            Effect.orElseSucceed(() => undefined),
          ),
        ),
      ),
    ),
  ).pipe(
    Effect.map(
      (names) => new Set(names.flat().filter((name): name is string => name !== undefined)),
    ),
  );
