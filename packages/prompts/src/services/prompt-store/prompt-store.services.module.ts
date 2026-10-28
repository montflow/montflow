import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';

/** Failure when a prompt file cannot be read or written. */
export class StoreError extends Schema.TaggedError<StoreError>()('PromptStore.StoreError', {
  message: Schema.String,
}) {}

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'prompts'] as const;
const LEGACY_PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** Prompts root for a working directory: `<cwd>/.agents/@montflow/prompts`. */
const promptsDir = (path: Path.Path, cwd: string): string => path.join(cwd, ...PROMPTS_DIR);

const legacyPromptsDirPath = (path: Path.Path, cwd: string): string =>
  path.join(cwd, ...LEGACY_PROMPTS_DIR);

/**
 * Directory the store reads/writes. An explicit `dir` wins (resolved
 * against `cwd`), so callers can target a folder other than the default
 * `<cwd>/.agents/@montflow/prompts`. Falls back to legacy `pi-prompts` if new dir missing.
 * @param path - Path service
 * @param cwd - working directory
 * @param dir - explicit store directory, if any
 * @returns absolute store directory
 */
const storeDir = Effect.fn('PromptStore.storeDir')(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  dir: string | undefined,
) {
  if (dir !== undefined && dir !== '') {
    return path.resolve(cwd, dir);
  }
  const target = promptsDir(path, cwd);
  const exists = yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false));
  if (exists) return target;
  const legacy = legacyPromptsDirPath(path, cwd);
  const legacyExists = yield* fs.exists(legacy).pipe(Effect.orElseSucceed(() => false));
  if (legacyExists) return legacy;
  return target;
});

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const list = Effect.fn('PromptStore.list')(function* (cwd: string, dir?: string) {
    const root = yield* storeDir(fs, path, cwd, dir);
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
    const root = yield* storeDir(fs, path, cwd, dir);
    const file = path.join(root, `${name}.json`);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Prompt not found: '${name}'.` }));
    }
    yield* fs.remove(file);
  });

  const readRaw = Effect.fn('PromptStore.readRaw')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown prompt '${name}'.` }));
    }
    const root = yield* storeDir(fs, path, cwd, dir);
    const file = path.join(root, `${name}.json`);
    return yield* fs
      .readFileString(file)
      .pipe(
        Effect.catch(() => Effect.fail(new StoreError({ message: `Unknown prompt '${name}'.` }))),
      );
  });

  const readAllRaw = Effect.fn('PromptStore.readAllRaw')(function* (cwd: string, dir?: string) {
    const root = yield* storeDir(fs, path, cwd, dir);
    const entries = yield* fs.readDirectory(root);
    const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
    return yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(root, file)).pipe(
        Effect.map((contents) => ({ name: file.replace(/\.json$/u, ''), contents })),
        Effect.catch(() => Effect.succeed(undefined)),
      ),
    ).pipe(
      Effect.map((items) =>
        items.filter((item): item is { name: string; contents: string } => item !== undefined),
      ),
    );
  });

  const write = Effect.fn('PromptStore.write')(function* (
    cwd: string,
    name: string,
    contents: string,
    dir?: string,
  ) {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Invalid prompt name '${name}'.` }));
    }
    const root = yield* storeDir(fs, path, cwd, dir);
    yield* fs.makeDirectory(root, { recursive: true });
    yield* fs.writeFileString(path.join(root, `${name}.json`), contents);
  });

  const save = Effect.fn('PromptStore.save')(function* (
    cwd: string,
    prompt: Prompts.Prompt,
    dir?: string,
  ) {
    const contents = JSON.stringify(prompt, null, 2) + '\n';
    yield* write(cwd, prompt.name, contents, dir);
  });

  return { list, remove, readRaw, readAllRaw, write, save } as const;
});

export const Id = '@montflow/prompts/PromptStore';
export type Id = typeof Id;

export type Service = Effect.Success<typeof make>;

export class PromptStore extends Context.Service<PromptStore, Service>()(Id) {}

export const Default = Layer.effect(PromptStore, make);
