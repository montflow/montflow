import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { loadSpecs } from '../tui.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('TUI specs picker', () => {
  Vitest.it.effect('lists only directories that hold SPEC.md', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const specs = path.join(workspace, '.agents', '@montflow', 'specs');

      const write = (relative: string) =>
        Effect.gen(function* () {
          const target = path.join(specs, relative);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* fs.writeFileString(target, 'content\n');
        });

      yield* write('ship-login/SPEC.md');
      yield* write('ship-login/A/A001-implement/TASK.md');
      yield* write('ship-login/A/A001-implement/MEMORY.md');
      yield* write('ship-signup/SPEC.md');
      yield* write('ship-signup/B/B001-build/TASK.md');
      // A phase directory and a task directory never carry SPEC.md.
      yield* write('ship-login/A/A001-implement/GATES.md');
      // A stray directory with no SPEC.md is not a spec.
      yield* write('not-a-spec/notes.txt');

      Vitest.expect(yield* Effect.promise(() => loadSpecs(workspace))).toStrictEqual([
        'ship-login',
        'ship-signup',
      ]);
    }).pipe(Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('returns an empty list when the store is missing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      Vitest.expect(yield* Effect.promise(() => loadSpecs(workspace))).toStrictEqual([]);
    }).pipe(Effect.provide(PlatformLayer)),
  );
});
