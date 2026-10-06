import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Features from '../index.js';
import * as Runs from '../../runs/index.js';
import { makeHarness, messageEvent, poll, settleEvent } from '../../runs/tests/harness.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'workspace-feature-begin-'));

/** Seed a feature directory the way the author run would (raw id diff only). */
const writeFeature = (root: string, id: string): Promise<void> => {
  const dir = join(root, '.agents', '@montflow', 'features', id);
  return mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, 'FEATURE.md'), '# x\n'));
};

/** Assistant turn carrying the author run's one-line reply. */
const assistantReply = (text: string) => ({
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text }],
  api: 'test' as const,
  provider: 'test' as const,
  model: 'test-model',
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'stop' as const,
  timestamp: 1,
});

Vitest.afterEach(async () => {
  await Runs.resetRunnerRuntimes();
  Runs.setSessionFactoryLayer(undefined);
  Runs.setExtensionProbe(undefined);
  Features.resetExtensionCache();
});

Vitest.describe('Features.beginFeature dispatch', () => {
  Vitest.it.live('gates on the runs extension without dispatching', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(false));
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Features.beginFeature(root, { description: 'Ship login' }).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toBe(Runs.RUNS_EXTENSION_INSTALL_HINT);
      Vitest.expect(harness.sessions.length).toBe(0);
    }),
  );

  Vitest.it.live('dispatches an author run with the authoring prompt and bash', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const { runId } = yield* Features.beginFeature(root, { description: 'Ship login' });
      Vitest.expect(runId).toMatch(/^author-feature-/);
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      Vitest.expect([...(session.request.tools ?? [])].toSorted()).toStrictEqual(
        [...Features.FEATURE_RUN_TOOLS].toSorted(),
      );
      const prompt = yield* poll(
        Effect.sync(() => session.prompts[0]),
        (value) => value !== undefined,
      );
      Vitest.expect(prompt).toContain('You are a feature-spec author');
      Vitest.expect(prompt).toContain('# authoring-feature-spec');
      Vitest.expect(prompt).toContain('Feature request: Ship login');
      Vitest.expect(prompt).toContain('ask_user');
      Vitest.expect(prompt).toContain('packages/pi-features cli check');
    }),
  );

  Vitest.it.live('fires the completion hook with the fresh feature on settle', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const created: Array<readonly [string, string]> = [];
      const failed: Array<string> = [];
      const { runId } = yield* Features.beginFeature(root, {
        description: 'Ship login',
        hooks: {
          onFeatureCreated: (featureId, id) => created.push([featureId, id]),
          onFeatureFailed: (message) => failed.push(message),
        },
      });
      yield* Effect.promise(() => writeFeature(root, 'ship-login'));
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      messageEvent(session, assistantReply('ship-login — 3 phases, check clean'));
      settleEvent(session);
      yield* poll(
        Effect.sync(() => created.length + failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed).toStrictEqual([]);
      Vitest.expect(created).toStrictEqual([['ship-login', runId]]);
    }),
  );

  Vitest.it.live('reports a settle with no fresh feature', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      const failed: Array<string> = [];
      yield* Features.beginFeature(root, {
        description: 'Ship login',
        hooks: { onFeatureFailed: (message) => failed.push(message) },
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      settleEvent(session);
      yield* poll(
        Effect.sync(() => failed.length),
        (count) => count > 0,
      );
      Vitest.expect(failed[0]).toContain('without creating a feature');
    }),
  );
});

Vitest.describe('Features.activeFeatureIds', () => {
  Vitest.it.live('lists a live run bound to a feature', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Runs.startRun(root, {
        id: 'execute-ship-login-1',
        prompt: 'do it',
        feature: 'ship-login',
      });
      const active = yield* Features.activeFeatureIds(root);
      Vitest.expect([...active]).toStrictEqual(['ship-login']);
    }),
  );

  Vitest.it.live('excludes a run bound to a feature once it settles', () =>
    Effect.gen(function* () {
      const harness = makeHarness();
      Runs.setSessionFactoryLayer(harness.layer);
      Runs.setExtensionProbe(() => Effect.succeed(true));
      const root = yield* Effect.promise(freshRoot);
      yield* Runs.startRun(root, {
        id: 'execute-ship-login-1',
        prompt: 'do it',
        feature: 'ship-login',
      });
      const session = harness.sessions[0];
      if (session === undefined) return yield* Effect.fail('session not created');
      yield* Effect.yieldNow;
      settleEvent(session);
      yield* poll(Features.activeFeatureIds(root), (active) => active.size === 0);
    }),
  );
});

Vitest.describe('Features.pickAuthoredFeature', () => {
  Vitest.it('prefers the reply-named feature', () => {
    Vitest.expect(
      Features.pickAuthoredFeature('ship-login done', ['a', 'ship-login']),
    ).toStrictEqual({ kind: 'one', id: 'ship-login' });
  });

  Vitest.it('falls back to a single fresh feature', () => {
    Vitest.expect(Features.pickAuthoredFeature('done', ['only'])).toStrictEqual({
      kind: 'one',
      id: 'only',
    });
  });

  Vitest.it('reports ambiguity for several unnamed features', () => {
    Vitest.expect(Features.pickAuthoredFeature('done', ['b', 'a'])).toStrictEqual({
      kind: 'ambiguous',
      ids: ['a', 'b'],
    });
  });

  Vitest.it('reports none for no fresh feature', () => {
    Vitest.expect(Features.pickAuthoredFeature('done', [])).toStrictEqual({ kind: 'none' });
  });
});
