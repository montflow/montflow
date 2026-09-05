import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';

/** Failure when a prompt file cannot be written. */
export class StoreError extends Schema.TaggedError<StoreError>()('PromptStore.StoreError', {
  message: Schema.String,
}) {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const list = Effect.fn('PromptStore.list')(function* (cwd: string) {
    const dir = path.join(cwd, '.agents', '@montflow', 'pi-prompts');
    const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as const));
    const files = entries.filter((entry) => entry.endsWith('.json'));
    const prompts = yield* Effect.forEach(files, (file) =>
      fs.readFileString(path.join(dir, file)).pipe(
        Effect.flatMap((raw) => Effect.try(() => Schema.decodeUnknownSync(Prompts.FromJson)(raw))),
        Effect.catch(() => Effect.succeed(undefined)),
      ),
    );
    return prompts
      .filter((prompt): prompt is Prompts.Prompt => prompt !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });

  const remove = Effect.fn('PromptStore.remove')(function* (cwd: string, name: string) {
    if (name.includes('/') || name.includes('\\')) {
      return yield* Effect.fail(new StoreError({ message: `Invalid prompt name '${name}'.` }));
    }
    const dir = path.join(cwd, '.agents', '@montflow', 'pi-prompts');
    const file = path.join(dir, `${name}.json`);
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

  const save = Effect.fn('PromptStore.save')(function* (cwd: string, prompt: Prompts.Prompt) {
    if (prompt.name.includes('/') || prompt.name.includes('\\')) {
      return yield* Effect.fail(
        new StoreError({ message: `Invalid prompt name '${prompt.name}'.` }),
      );
    }
    const dir = path.join(cwd, '.agents', '@montflow', 'pi-prompts');
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
    const file = path.join(dir, `${prompt.name}.json`);
    yield* fs
      .writeFileString(file, `${JSON.stringify(Prompts.encode(prompt), null, 2)}\n`)
      .pipe(
        Effect.mapError(
          (error) => new StoreError({ message: `Failed to write ${file}: ${error.message}` }),
        ),
      );
  });

  return { list, remove, save } as const;
});

export const Id = '@montflow/PromptStore';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

export class PromptStore extends Context.Service<PromptStore, Impl>()(Id) {}

export const Default = Layer.effect(PromptStore, make);
