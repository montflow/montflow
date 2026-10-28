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

/** Retired prompts root for a working directory: `<cwd>/.agents/@montflow/pi-prompts`. */
export const legacyPromptsDir = (path: Path.Path, cwd: string): string =>
  path.join(cwd, ...LEGACY_PROMPTS_DIR);

/** Turn any filesystem failure into the one error domain this service declares. */
const toStoreError =
  (operation: string) =>
  (cause: { readonly message: string }): StoreError =>
    new StoreError({ message: `${operation} failed: ${cause.message}` });

/** The store layout for one workspace: where new files go, and where reads may look. */
export interface StoreLayout {
  /** Directory writes always target. */
  readonly writeRoot: string;
  /** Directory reads resolve against; the legacy root until a migration runs. */
  readonly readRoot: string;
  /** True when reads fell back to the retired layout. */
  readonly legacy: boolean;
}

/**
 * Resolve the store layout for a workspace. An explicit `dir` wins (resolved
 * against `cwd`) and disables the legacy fallback. Otherwise reads use the
 * current layout when it exists, else the retired layout when that exists, and
 * writes always land in the current layout so the migration converges.
 *
 * @param fs - filesystem service
 * @param path - path service
 * @param cwd - working directory
 * @param dir - explicit store directory, if any
 * @returns resolved write and read roots
 */
export const storeLayout = Effect.fn('PromptStore.storeLayout')(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  dir: string | undefined,
) {
  if (dir !== undefined && dir !== '') {
    const explicit = path.resolve(cwd, dir);
    return { writeRoot: explicit, readRoot: explicit, legacy: false } satisfies StoreLayout;
  }
  const current = promptsDir(path, cwd);
  const legacy = legacyPromptsDir(path, cwd);
  const currentExists = yield* fs.exists(current).pipe(Effect.orElseSucceed(() => false));
  if (currentExists)
    return { writeRoot: current, readRoot: current, legacy: false } satisfies StoreLayout;
  const legacyExists = yield* fs.exists(legacy).pipe(Effect.orElseSucceed(() => false));
  if (legacyExists)
    return { writeRoot: current, readRoot: legacy, legacy: true } satisfies StoreLayout;
  return { writeRoot: current, readRoot: current, legacy: false } satisfies StoreLayout;
});

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const list = Effect.fn('PromptStore.list')(function* (cwd: string, dir?: string) {
    const layout = yield* storeLayout(fs, path, cwd, dir);
    const exists = yield* fs.exists(layout.readRoot).pipe(Effect.orElseSucceed(() => false));
    // A missing store is an empty store, not a read failure: `list` powers the
    // empty-state message, while `readAllRaw` fails loudly for verification.
    if (!exists) return [] as const;
    const entries = yield* fs
      .readDirectory(layout.readRoot)
      .pipe(Effect.mapError(toStoreError('PromptStore.list')));
    const files = entries.filter((entry) => entry.endsWith('.json'));
    const prompts = yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(layout.readRoot, file)).pipe(
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
    const layout = yield* storeLayout(fs, path, cwd, dir);
    const file = path.join(layout.readRoot, `${name}.json`);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Prompt not found: '${name}'.` }));
    }
    yield* fs.remove(file).pipe(Effect.mapError(toStoreError('PromptStore.remove')));
  });

  const readRaw = Effect.fn('PromptStore.readRaw')(function* (
    cwd: string,
    name: string,
    dir?: string,
  ) {
    if (!Prompts.isValidName(name)) {
      return yield* Effect.fail(new StoreError({ message: `Unknown prompt '${name}'.` }));
    }
    const layout = yield* storeLayout(fs, path, cwd, dir);
    const file = path.join(layout.readRoot, `${name}.json`);
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(new StoreError({ message: `Unknown prompt '${name}'.` }));
    }
    return yield* fs
      .readFileString(file)
      .pipe(Effect.mapError(toStoreError(`PromptStore.readRaw '${name}'`)));
  });

  const readAllRaw = Effect.fn('PromptStore.readAllRaw')(function* (cwd: string, dir?: string) {
    const layout = yield* storeLayout(fs, path, cwd, dir);
    const exists = yield* fs.exists(layout.readRoot).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(
        new StoreError({ message: `Prompts store not found at '${layout.readRoot}'.` }),
      );
    }
    const entries = yield* fs
      .readDirectory(layout.readRoot)
      .pipe(Effect.mapError(toStoreError('PromptStore.readAllRaw')));
    const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
    return yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(layout.readRoot, file)).pipe(
        Effect.map((contents) => ({ name: file.replace(/\.json$/u, ''), contents })),
        // Keep the entry with empty content: verification must report the file
        // rather than silently drop a prompt it could not read.
        Effect.catch(() => Effect.succeed({ name: file.replace(/\.json$/u, ''), contents: '' })),
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
    const layout = yield* storeLayout(fs, path, cwd, dir);
    yield* fs
      .makeDirectory(layout.writeRoot, { recursive: true })
      .pipe(Effect.mapError(toStoreError('PromptStore.write')));
    yield* fs
      .writeFileString(path.join(layout.writeRoot, `${name}.json`), contents)
      .pipe(Effect.mapError(toStoreError('PromptStore.write')));
  });

  const save = Effect.fn('PromptStore.save')(function* (
    cwd: string,
    prompt: Prompts.Prompt,
    dir?: string,
  ) {
    const contents = JSON.stringify(Prompts.encode(prompt), null, 2) + '\n';
    yield* write(cwd, prompt.name, contents, dir);
  });

  return { list, remove, readRaw, readAllRaw, write, save } as const;
});

export const Id = '@montflow/prompts/PromptStore';
export type Id = typeof Id;

export type Service = Effect.Success<typeof make>;

export class PromptStore extends Context.Service<PromptStore, Service>()(Id) {}

/** File-backed store; provide `NodeFileSystem` + `NodePath` at the composition root. */
export const Default = Layer.effect(PromptStore, make);
