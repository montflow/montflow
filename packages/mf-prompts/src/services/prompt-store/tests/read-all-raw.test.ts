import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '../index.js';

/** Platform layers plus the store, for real-directory enumeration tests. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const TestLive = Layer.provide(PromptStore.Default, NodeLive);

Vitest.describe('PromptStore.readAllRaw', () => {
  Vitest.it.effect('sees corrupt and non-json entries, and fails on a missing store', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-raw-' });
      const store = `${dir}/store`;
      yield* fs.makeDirectory(store, { recursive: true });
      yield* fs.writeFileString(`${store}/good.json`, '{}');
      yield* fs.writeFileString(`${store}/broken.json`, '{ not json');
      yield* fs.writeFileString(`${store}/notes.txt`, 'not a prompt');

      const entries = yield* PromptStore.PromptStore.pipe(
        Effect.flatMap((prompts) => prompts.readAllRaw(dir, 'store')),
      );
      Vitest.expect(entries.map((entry) => entry.name)).toStrictEqual(['broken', 'good']);
      Vitest.expect(entries.find((entry) => entry.name === 'broken')?.raw).toBe('{ not json');

      const missing = yield* PromptStore.PromptStore.pipe(
        Effect.flatMap((prompts) => prompts.readAllRaw(dir, 'does-not-exist')),
        Effect.flip,
      );
      Vitest.expect(String(missing)).toContain('not found');
    }).pipe(Effect.provide(Layer.mergeAll(TestLive, NodeLive)), Effect.scoped),
  );
});
