import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PromptStore from '../prompt-store.services.module.js';
import * as Prompts from '../../../modules/prompts/index.js';

/** Node platform layers, then the real file-backed store built on top. */
const PlatformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.provideMerge(PromptStore.Default, PlatformLayer);

const CURRENT = Prompts.STORE_SEGMENTS;
const LEGACY = Prompts.LEGACY_STORE_SEGMENTS;

/** Minimal valid prompt JSON in the documented wire form. */
const promptJson = (name: string): string =>
  `${JSON.stringify({
    name,
    description: `${name} description`,
    template: `run ${name}`,
    variables: [],
    skills: [],
    model: '',
  })}\n`;

Vitest.describe('PromptStore layout', () => {
  Vitest.it.effect('reads from the retired store while it is the only one present', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });
      const legacy = path.join(cwd, ...LEGACY);
      yield* fs.makeDirectory(legacy, { recursive: true });
      yield* fs.writeFileString(path.join(legacy, 'legacy.json'), promptJson('legacy'));

      const store = yield* PromptStore.PromptStore;
      const prompts = yield* store.list(cwd);
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['legacy']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('migrates a legacy-only store on the first write', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });
      const legacy = path.join(cwd, ...LEGACY);
      const current = path.join(cwd, ...CURRENT);
      yield* fs.makeDirectory(legacy, { recursive: true });
      yield* fs.writeFileString(path.join(legacy, 'old.json'), promptJson('old'));

      const store = yield* PromptStore.PromptStore;
      yield* store.write(cwd, 'fresh', promptJson('fresh'));

      Vitest.expect(yield* fs.exists(path.join(current, 'fresh.json'))).toBe(true);
      Vitest.expect(yield* fs.exists(path.join(current, 'old.json'))).toBe(true);
      Vitest.expect(yield* fs.exists(legacy)).toBe(false);

      // Both prompts stay visible to every reader after the move.
      const prompts = yield* store.list(cwd);
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['fresh', 'old']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('prefers the current store when both directories exist', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });
      const legacy = path.join(cwd, ...LEGACY);
      const current = path.join(cwd, ...CURRENT);
      yield* fs.makeDirectory(legacy, { recursive: true });
      yield* fs.makeDirectory(current, { recursive: true });
      yield* fs.writeFileString(path.join(legacy, 'old.json'), promptJson('old'));
      yield* fs.writeFileString(path.join(current, 'new.json'), promptJson('new'));

      const store = yield* PromptStore.PromptStore;
      const prompts = yield* store.list(cwd);
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['new']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('an explicit dir bypasses both default stores', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });
      const custom = path.join(cwd, 'elsewhere');
      yield* fs.makeDirectory(custom, { recursive: true });
      yield* fs.writeFileString(path.join(custom, 'custom.json'), promptJson('custom'));

      const store = yield* PromptStore.PromptStore;
      const prompts = yield* store.list(cwd, 'elsewhere');
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['custom']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('readAllRaw fails when the store directory is missing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });

      const store = yield* PromptStore.PromptStore;
      const error = yield* store.readAllRaw(cwd).pipe(Effect.flip);
      Vitest.expect(error.message).toContain('Prompts store not found');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('save writes the canonical wire form, not resolved defaults', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-prompts-layout-' });
      const prompt = yield* Prompts.decodeUnknown({
        name: 'canonical',
        description: 'canonical description',
        template: 'run {{target}}',
        variables: [{ name: 'target' }],
        skills: [],
        model: '',
      });

      const store = yield* PromptStore.PromptStore;
      yield* store.save(cwd, prompt);

      const raw = yield* fs.readFileString(path.join(cwd, ...CURRENT, 'canonical.json'));
      const parsed: unknown = JSON.parse(raw);
      Vitest.expect(parsed).toMatchObject({ variables: [{ name: 'target' }] });
    }).pipe(Effect.provide(StoreLive)),
  );
});
