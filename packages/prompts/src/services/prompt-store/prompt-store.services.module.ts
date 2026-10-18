import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';

/** Failure when a prompt file cannot be read or written. */
export class StoreError extends Schema.TaggedError<StoreError>()('PromptStore.StoreError', {
  message: Schema.String,
}) {}

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** Prompts root for a working directory: `<cwd>/.agents/@montflow/pi-prompts`. */
const promptsDir = (path: Path.Path, cwd: string): string => path.join(cwd, ...PROMPTS_DIR);

/**
 * Directory the store reads/writes. An explicit `dir` wins (resolved
 * against `cwd`), so callers can target a folder other than the default
 * `<cwd>/.agents/@montflow/pi-prompts`.
 * @param path - Path service
 * @param cwd - working directory
 * @param dir - explicit store directory, if any
 * @returns absolute store directory
 */
const storeDir = (path: Path.Path, cwd: string, dir: string | undefined): string =>
  dir === undefined || dir === '' ? promptsDir(path, cwd) : path.resolve(cwd, dir);

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const list = Effect.fn('PromptStore.list')(function* (cwd: string, dir?: string) {
    const root = storeDir(path, cwd, dir);
    const entries = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => [] as const));
    const files = entries.filter((entry) => entry.endsWith('.json'));
    const prompts = yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(root, file)).pipe(
        Effect.flatMap((raw) => Effect.try(() => Schema.decodeUnknownSync(Prompts.FromJson)(raw))),
        Effect.catch(() => Effect.succeed(undefined)),
      ),
    );
    return prompts
      .filter((prompt): prompt is Prompts.Prompt => prompt !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });

  const remove = Effect.fn('PromptStore.remove')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Invalid prompt name '${name}'.` }));
    }
    const file = path.join(storeDir(path, cwd, dir), `${name}.json`);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Prompt not found: '${name}'.` }));
    }
    yield* fs
      .remove(file)
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to delete '${name}': ${error.message}` }),
        ),
      );
  });

  const save = Effect.fn('PromptStore.save')(function* (
    cwd: string,
    prompt: Prompts.Prompt,
    dir?: string,
  ) {
    if (!Prompts.isValidName(prompt.name)) {
      return yield* Effect.fail(
        new StoreError({ message: `Invalid prompt name '${prompt.name}'.` }),
      );
    }
    const root = storeDir(path, cwd, dir);
    yield* fs.makeDirectory(root, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    const file = path.join(root, `${prompt.name}.json`);
    yield* fs
      .writeFileString(file, `${JSON.stringify(Prompts.encode(prompt), null, 2)}\n`)
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to write ${file}: ${error.message}` }),
        ),
      );
  });

  const readRaw = Effect.fn('PromptStore.readRaw')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown prompt '${name}'.` }));
    }
    const file = path.join(storeDir(path, cwd, dir), `${name}.json`);
    const raw = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError(() => new StoreError({ message: `Unknown prompt '${name}'.` })));
    return raw;
  });

  /**
   * Every `*.json` file in the store, as `{ name, raw }`, without decoding.
   * Unlike {@link list}, this never drops a file the store cannot decode, so a
   * caller (e.g. `verify --all`) can report a corrupt file instead of missing
   * it. A missing store is an error rather than an empty pass, so a wrong
   * `--dir` cannot silently verify nothing. An unreadable file yields empty
   * raw bytes, which verification rejects.
   * @param cwd - working directory
   * @param dir - explicit store directory, if any
   * @returns every prompt file's name and raw contents, name-sorted
   */
  const readAllRaw = Effect.fn('PromptStore.readAllRaw')(function* (cwd: string, dir?: string) {
    const root = storeDir(path, cwd, dir);
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(
        new StoreError({ message: `Prompts store not found at '${root}'.` }),
      );
    }
    const entries = yield* fs
      .readDirectory(root)
      .pipe(
        Effect.mapError(
          (cause) => new StoreError({ message: `Cannot read '${root}': ${cause.message}` }),
        ),
      );
    const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
    const suffix = '.json'.length;
    return yield* Effect.forEach(files, (file) => {
      const name = file.slice(0, -suffix);
      return fs.readFileString(path.join(root, file)).pipe(
        Effect.map((raw) => ({ name, raw })),
        Effect.catch(() => Effect.succeed({ name, raw: '' })),
      );
    });
  });

  return { list, remove, save, readRaw, readAllRaw } as const;
});

export const Id = '@montflow/PromptStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PromptStore extends Context.Service<PromptStore, Impl>()(Id) {}

export const Default = Layer.effect(PromptStore, make);
