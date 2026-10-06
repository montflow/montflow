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

  return { list, remove, save, readRaw } as const;
});

export const Id = '@montflow/PromptStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PromptStore extends Context.Service<PromptStore, Impl>()(Id) {}

export const Default = Layer.effect(PromptStore, make);
