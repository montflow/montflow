import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { phaseMarkdown } from '../modules/phase/tests/helpers.js';
import { specMarkdown } from '../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../modules/task/tests/helpers.js';
import { describeSpec, loadSpecs } from '../tui.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('TUI specs picker', () => {
  Vitest.it.effect('lists only directories that hold SPEC.md', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const specs = path.join(workspace, '.agents', '@montflow', 'specs');

      const write = (relative: string, content = 'content\n') =>
        Effect.gen(function* () {
          const target = path.join(specs, relative);
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* fs.writeFileString(target, content);
        });

      const rows = [
        { id: 'A001', name: 'implement', type: 'execution', status: 'pending', gates: 'No' },
      ];
      yield* write('ship-login/SPEC.md', specMarkdown({ name: 'ship-login', version: '2', rows }));
      yield* write('ship-login/A/PHASE.md', phaseMarkdown({ id: 'A', review: 'required' }));
      yield* write('ship-login/A/MEMORY.md', memoryMarkdown());
      yield* write(
        'ship-login/A/A001-implement/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement' }),
      );
      yield* write('ship-login/A/A001-implement/MEMORY.md', memoryMarkdown());
      yield* write(
        'ship-signup/SPEC.md',
        specMarkdown({
          name: 'ship-signup',
          version: '2',
          rows: [{ id: 'B001', name: 'build', type: 'execution', status: 'pending', gates: 'No' }],
        }),
      );
      yield* write('ship-signup/B/PHASE.md', phaseMarkdown({ id: 'B', review: 'waived' }));
      yield* write('ship-signup/B/MEMORY.md', memoryMarkdown());
      yield* write('ship-signup/B/B001-build/TASK.md', taskMarkdown({ id: 'B001', name: 'build' }));
      yield* write('ship-signup/B/B001-build/MEMORY.md', memoryMarkdown());
      // A phase directory where a spec could sit: it has PHASE.md but no
      // SPEC.md, so the picker must never offer it.
      yield* write('C/PHASE.md', phaseMarkdown({ id: 'C' }));
      yield* write('C/MEMORY.md', memoryMarkdown());
      // A stray directory with no SPEC.md is not a spec.
      yield* write('not-a-spec/notes.txt');

      const found = yield* Effect.promise(() => loadSpecs(workspace));
      Vitest.expect(found.map((spec) => spec.name)).toStrictEqual(['ship-login', 'ship-signup']);
      const login = found[0];
      Vitest.expect(login?.state).toBe('pending');
      Vitest.expect(login?.phase).toBe('A');
      Vitest.expect(login?.reviews.map((phase) => [phase.phase, phase.review])).toStrictEqual([
        ['A', 'required'],
      ]);
      Vitest.expect(describeSpec(login!)).toContain('phase A');
      Vitest.expect(describeSpec(login!)).toContain('review A:required');
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
