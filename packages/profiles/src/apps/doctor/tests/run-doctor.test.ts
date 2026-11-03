import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, FileSystem, Layer } from 'effect';
import * as Path from 'node:path';
import * as Vitest from 'vitest';
import { runDoctor } from '../doctor.apps.module.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const withTempRoot = <A>(
  run: (root: string) => Effect.Effect<A>,
): Promise<A> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectory({ prefix: 'mf-profiles-doctor-' });
    const result = yield* run(root).pipe(
      Effect.ensuring(
        fs.remove(root, { recursive: true, force: true }).pipe(Effect.orElseSucceed(() => undefined)),
      ),
    );
    return result;
  }).pipe(Effect.provide(NodeLive), Effect.runPromise);

Vitest.describe('mf-profiles doctor agents check', () => {
  Vitest.it('creates AGENTS.md with profiles guidance when missing', async () => {
    await withTempRoot((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const result = yield* runDoctor(root, {});
        const agentsPath = Path.join(root, 'AGENTS.md');
        const exists = yield* fs.exists(agentsPath).pipe(Effect.orElseSucceed(() => false));
        Vitest.expect(result.agents?.status).toBe('created');
        Vitest.expect(exists).toBe(true);
        const content = yield* fs.readFileString(agentsPath);
        Vitest.expect(content).toContain('montflow-create-profiles');
        Vitest.expect(content).toContain('mf-profiles');
      }),
    );
  });

  Vitest.it('reports ok on second run', async () => {
    await withTempRoot((root) =>
      Effect.gen(function* () {
        yield* runDoctor(root, {});
        const second = yield* runDoctor(root, {});
        Vitest.expect(second.agents?.status).toBe('ok');
      }),
    );
  });

  Vitest.it('repairs missing guidance in fix mode', async () => {
    await withTempRoot((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(Path.join(root, 'AGENTS.md'), '# Agents\n');
        const repaired = yield* runDoctor(root, {});
        Vitest.expect(repaired.agents?.status).toBe('repaired');
        const content = yield* fs.readFileString(Path.join(root, 'AGENTS.md'));
        Vitest.expect(content).toContain('montflow-create-profiles');
      }),
    );
  });

  Vitest.it('check mode reports missing/missing-guidance without writing', async () => {
    await withTempRoot((root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const missing = yield* runDoctor(root, { check: true });
        Vitest.expect(missing.agents?.status).toBe('missing');
        Vitest.expect(missing.healthy).toBe(false);
        const exists = yield* fs.exists(Path.join(root, 'AGENTS.md')).pipe(Effect.orElseSucceed(() => false));
        Vitest.expect(exists).toBe(false);
        yield* fs.writeFileString(Path.join(root, 'AGENTS.md'), '# Agents\n');
        const missingGuidance = yield* runDoctor(root, { check: true });
        Vitest.expect(missingGuidance.agents?.status).toBe('missing-guidance');
        Vitest.expect(missingGuidance.healthy).toBe(false);
      }),
    );
  });
});
