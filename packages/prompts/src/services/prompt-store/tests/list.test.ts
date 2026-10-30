import * as Fs from 'node:fs';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '../index.js';

/** Node platform layers, then the real file-backed store built on top. */
const PlatformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, PlatformLayer);

/** Store directory segments under a working directory. */
const STORE_SEGMENTS = ['.agents', '@montflow', 'prompts'] as const;

const validPrompt = (name: string): string =>
  `${JSON.stringify({
    name,
    description: `Prompt ${name}.`,
    template: 'Do the thing.',
    variables: [],
    skills: [],
    model: '',
  })}\n`;

Vitest.describe('PromptStore.list runtime', () => {
  Vitest.it.effect('lists decodable prompts and drops only decode failures', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-list-' });
      const dir = path.join(cwd, ...STORE_SEGMENTS);
      yield* fs.makeDirectory(dir, { recursive: true });
      yield* fs.writeFileString(path.join(dir, 'commit.json'), validPrompt('commit'));
      yield* fs.writeFileString(path.join(dir, 'broken.json'), '{ not a prompt');

      const store = yield* PromptStore.PromptStore;
      const prompts = yield* store.list(cwd);
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['commit']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('surfaces an unreadable prompt instead of shortening the list', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-list-' });
      const dir = path.join(cwd, ...STORE_SEGMENTS);
      yield* fs.makeDirectory(dir, { recursive: true });
      const readable = path.join(dir, 'commit.json');
      const unreadable = path.join(dir, 'hidden.json');
      yield* fs.writeFileString(readable, validPrompt('commit'));
      yield* fs.writeFileString(unreadable, validPrompt('hidden'));
      Fs.chmodSync(unreadable, 0o000);

      const store = yield* PromptStore.PromptStore;
      const error = yield* store.list(cwd).pipe(Effect.flip);
      Vitest.expect(error.path).toBe(unreadable);
      Vitest.expect(error.message).toContain(`Cannot read '${unreadable}'`);
      Vitest.expect(error.cause).toBeDefined();

      Fs.chmodSync(unreadable, 0o644);
    }).pipe(Effect.provide(StoreLive)),
  );
});
