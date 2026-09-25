import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { Runner, type RunnerImpl, WorkspaceBridge } from '../../../services/index.js';
import { createRunnerHost } from '../index.js';

const impl: RunnerImpl = {
  start: () => Effect.fail('unused'),
  resume: () => Effect.fail('unused'),
  steer: () => Effect.void,
  answer: () => Effect.void,
  interrupt: () => Effect.void,
  detail: () => Effect.fail('unused'),
  verify: () => Effect.fail('unused'),
  progress: () => Effect.void,
  list: () => Effect.succeed([]),
};

const noopBridge = Layer.succeed(WorkspaceBridge, {
  toast: () => Effect.void,
  notify: () => Effect.void,
});

Vitest.describe('createRunnerHost runtime', () => {
  Vitest.it.effect('caches one runtime per repo root and keeps roots isolated', () =>
    Effect.gen(function* () {
      const host = createRunnerHost({
        layerFor: () => Layer.succeed(Runner, impl),
        bridgeFor: () => noopBridge,
      });
      const first = host.runtimeFor('/repo-a');
      const second = host.runtimeFor('/repo-a');
      const other = host.runtimeFor('/repo-b');
      Vitest.expect(first).toBe(second);
      Vitest.expect(first).not.toBe(other);
      yield* Effect.promise(() => host.disposeAll());
      Vitest.expect(host.runtimeFor('/repo-a')).not.toBe(first);
    }),
  );

  Vitest.it.effect('disposeAll releases every runtime resource', () =>
    Effect.gen(function* () {
      const released: Array<string> = [];
      const host = createRunnerHost({
        layerFor: (root) =>
          Layer.effect(
            Runner,
            Effect.acquireRelease(Effect.succeed(impl), () =>
              Effect.sync(() => {
                released.push(root);
              }),
            ),
          ),
        bridgeFor: () => noopBridge,
      });
      host.runtimeFor('/repo-a');
      host.runtimeFor('/repo-b');
      // The layer is built lazily on first use; force each build before disposing.
      yield* Effect.promise(() =>
        Promise.all([
          host.runtimeFor('/repo-a').runPromise(Runner),
          host.runtimeFor('/repo-b').runPromise(Runner),
        ]),
      );
      yield* Effect.promise(() => host.disposeAll());
      Vitest.expect(released.toSorted()).toStrictEqual(['/repo-a', '/repo-b']);
    }),
  );
});
