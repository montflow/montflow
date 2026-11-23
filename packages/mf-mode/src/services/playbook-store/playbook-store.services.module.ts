import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Extension from '../../modules/extension/index.js';
import * as Playbook from '../../modules/playbook/index.js';
import { MarkdownStore } from '../markdown-store/index.js';

/** Failure when the playbook store or one of its files cannot be read. */
export class StoreError extends Schema.TaggedError<StoreError>()('PlaybookStore.StoreError', {
  message: Schema.String,
}) {}

/** One playbook file, undecoded. */
export type RawEntry = Extension.RawEntry;

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const read = (root: string, dir: ReadonlyArray<string>) =>
    MarkdownStore.readEntries(fs, path, path.join(root, ...dir), Playbook.FILE).pipe(
      Effect.mapError((message) => new StoreError({ message })),
    );

  /**
   * Every directory in the shipped store,
   * `<root>/.agents/@montflow/playbooks`, undecoded and name-sorted, so
   * `verify` can report a corrupt file instead of missing it. A missing store
   * is an empty list.
   * @param root - workspace root
   * @returns every shipped entry's name and raw contents
   */
  const readAllRaw = Effect.fn('PlaybookStore.readAllRaw')(function* (root: string) {
    return yield* read(root, Playbook.STORE_DIR);
  });

  /**
   * Every directory in the repo's extension store,
   * `<root>/.agents/@montflow/mf-mode/extensions/playbooks`, read the same way
   * as the shipped store.
   * @param root - workspace root
   * @returns every extension entry's name and raw contents
   */
  const readExtensionsRaw = Effect.fn('PlaybookStore.readExtensionsRaw')(function* (root: string) {
    return yield* read(root, Playbook.EXTENSION_DIR);
  });

  /**
   * What a reader sees: each extension over the shipped entry of its name.
   * @param root - workspace root
   * @returns the resolved entries, name-sorted, and the extensions that did not resolve
   */
  const resolve = Effect.fn('PlaybookStore.resolve')(function* (root: string) {
    const [shipped, extensions] = yield* Effect.all([readAllRaw(root), readExtensionsRaw(root)]);
    return Extension.resolve(shipped, extensions, Playbook.KIND);
  });

  const readEntries = (dir: string) => fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));

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
    const under = (dirs: ReadonlyArray<ReadonlyArray<string>>, file: string) =>
      MarkdownStore.entryNames(
        fs,
        path,
        dirs.map((dir) => path.join(root, ...dir)),
        file,
      );
    const [skills, principles, playbooks, scripts] = yield* Effect.all([
      under([Playbook.SKILLS_DIR], Playbook.SKILL_FILE),
      under([Playbook.PRINCIPLES_DIR, Playbook.PRINCIPLE_EXTENSION_DIR], Playbook.PRINCIPLE_FILE),
      under([Playbook.STORE_DIR, Playbook.EXTENSION_DIR], Playbook.FILE),
      installedScripts(root),
    ]);
    const resolved: Playbook.References = { root, skills, principles, playbooks, scripts };
    return resolved;
  });

  return { readAllRaw, readExtensionsRaw, resolve, references } as const;
});

export const Id = '@montflow/PlaybookStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PlaybookStore extends Context.Service<PlaybookStore, Impl>()(Id) {}

export const Default = Layer.effect(PlaybookStore, make);
