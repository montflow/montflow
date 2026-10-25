import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '../index.js';

/** Node platform layers, then the real file-backed store built on top. */
const PlatformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, PlatformLayer);

/** Store directory segments under a working directory. */
const STORE_SEGMENTS = ['.agents', '@montflow', 'pi-prompts'] as const;

Vitest.describe('PromptStore.readRaw runtime', () => {
  Vitest.it.effect('reads a prompt file back verbatim', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // `makeTempDirectoryScoped` lives under `os.tmpdir()` and is cleaned up by `it.effect`.
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-store-' });
      const dir = path.join(cwd, ...STORE_SEGMENTS);
      yield* fs.makeDirectory(dir, { recursive: true });
      const raw = '{"name":"commit"}\n';
      yield* fs.writeFileString(path.join(dir, 'commit.json'), raw);

      const store = yield* PromptStore.PromptStore;
      Vitest.expect(yield* store.readRaw(cwd, 'commit')).toBe(raw);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('fails for a missing file with the unknown-prompt message', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-store-' });

      const store = yield* PromptStore.PromptStore;
      const error = yield* store.readRaw(cwd, 'missing').pipe(Effect.flip);
      Vitest.expect(error.message).toBe("Unknown prompt 'missing'.");
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('fails for an invalid name before touching the filesystem', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-store-' });

      const store = yield* PromptStore.PromptStore;
      const error = yield* store.readRaw(cwd, 'Bad Name').pipe(Effect.flip);
      Vitest.expect(error.message).toBe("Unknown prompt 'Bad Name'.");
    }).pipe(Effect.provide(StoreLive)),
  );
});
