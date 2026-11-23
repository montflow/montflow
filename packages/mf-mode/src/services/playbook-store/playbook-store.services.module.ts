import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Playbook from '../../modules/playbook/index.js';

/** Failure when the playbook store or one of its files cannot be read. */
export class StoreError extends Schema.TaggedError<StoreError>()('PlaybookStore.StoreError', {
  message: Schema.String,
}) {}

/** One playbook file, undecoded. */
export interface RawEntry {
  readonly name: string;
  readonly raw: string;
}

/** Playbooks root for a workspace: `<root>/.agents/@montflow/playbooks`. */
const storeRoot = (path: Path.Path, root: string): string => path.join(root, ...Playbook.STORE_DIR);

/** The entries of a store that does not exist yet. */
const EMPTY: ReadonlyArray<RawEntry> = [];

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /**
   * Every directory in the store as `{ name, raw }`, without decoding, so
   * `verify` can report a corrupt file instead of missing it. A directory
   * with no readable `PLAYBOOK.md` yields empty bytes, which verification
   * rejects. A missing store is an empty list.
   * @param root - workspace root
   * @returns every entry's name and raw contents, name-sorted
   */
  const readAllRaw = Effect.fn('PlaybookStore.readAllRaw')(function* (root: string) {
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
      fs.readFileString(path.join(dir, name, Playbook.FILE)).pipe(
        Effect.map((raw) => ({ name, raw })),
        Effect.orElseSucceed(() => ({ name, raw: '' })),
      ),
    );
  });

  /**
   * Every playbook that decodes, name-sorted. A file that does not decode is
   * left to `verify`.
   * @param root - workspace root
   * @returns the decoded playbooks
   */
  const list = Effect.fn('PlaybookStore.list')(function* (root: string) {
    const raws = yield* readAllRaw(root);
    const decoded = yield* Effect.forEach(raws, ({ name, raw }) =>
      Playbook.decodeFile(name, raw).pipe(Effect.orElseSucceed(() => undefined)),
    );
    return decoded.filter((playbook): playbook is Playbook.Playbook => playbook !== undefined);
  });

  /**
   * One playbook's file bytes, unchanged.
   * @param root - workspace root
   * @param name - playbook slug
   * @returns the raw contents, failing when the name is not in the store
   */
  const readRaw = Effect.fn('PlaybookStore.readRaw')(function* (root: string, name: string) {
    if (!Playbook.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown playbook '${name}'.` }));
    }
    return yield* fs
      .readFileString(path.join(storeRoot(path, root), name, Playbook.FILE))
      .pipe(Effect.mapError(() => new StoreError({ message: `Unknown playbook '${name}'.` })));
  });

  const readEntries = (dir: string) => fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));

  /**
   * Names of the directories under one store that hold its entry file. A
   * missing store holds none.
   * @param dir - store directory
   * @param file - the file an entry directory must hold
   * @returns the entry names
   */
  const entryNames = (dir: string, file: string): Effect.Effect<ReadonlySet<string>> =>
    readEntries(dir).pipe(
      Effect.flatMap((entries) =>
        Effect.forEach(entries, (entry) =>
          fs.exists(path.join(dir, entry, file)).pipe(
            Effect.map((present) => (present ? entry : undefined)),
            Effect.orElseSucceed(() => undefined),
          ),
        ),
      ),
      Effect.map((names) => new Set(names.filter((name): name is string => name !== undefined))),
    );

  const scriptFiles = (dir: string): Effect.Effect<ReadonlyArray<string>> =>
    Effect.gen(function* () {
      const entries = yield* readEntries(dir);
      const children = yield* Effect.forEach(
        entries.filter((entry) => entry !== 'node_modules'),
        Effect.fnUntraced(function* (entry) {
          const child = path.join(dir, entry);
          const type = yield* fs.stat(child).pipe(
            Effect.map((info) => info.type),
            Effect.orElseSucceed(() => undefined),
          );
          if (type === 'File') return [child];
          if (type !== 'Directory') return [];
          const isLink = yield* fs.readLink(child).pipe(Effect.isSuccess);
          return isLink ? [] : yield* scriptFiles(child);
        }),
      );
      return children.flat();
    });

  const installedScripts = Effect.fn('PlaybookStore.installedScripts')(function* (root: string) {
    const dir = path.join(root, ...Playbook.SKILLS_DIR);
    const skills = yield* readEntries(dir);
    const files = yield* Effect.forEach(skills, (skill) =>
      scriptFiles(path.join(dir, skill, 'scripts')),
    );
    return new Set(files.flat().map((file) => path.relative(root, file).split(path.sep).join('/')));
  });

  const references = Effect.fn('PlaybookStore.references')(function* (root: string) {
    const skillsDir = path.join(root, ...Playbook.SKILLS_DIR);
    const [skills, principles, playbooks, scripts] = yield* Effect.all([
      entryNames(skillsDir, Playbook.SKILL_FILE),
      entryNames(path.join(root, ...Playbook.PRINCIPLES_DIR), Playbook.PRINCIPLE_FILE),
      entryNames(storeRoot(path, root), Playbook.FILE),
      installedScripts(root),
    ]);
    const resolved: Playbook.References = { root, skills, principles, playbooks, scripts };
    return resolved;
  });

  return { readAllRaw, list, readRaw, references } as const;
});

export const Id = '@montflow/PlaybookStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PlaybookStore extends Context.Service<PlaybookStore, Impl>()(Id) {}

export const Default = Layer.effect(PlaybookStore, make);
