import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ReviewStore } from '../index.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.provide(ReviewStore.Default, NodeLive);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-store-'));

Vitest.describe('ReviewStore', () => {
  Vitest.it.effect('saves and reads a series ledger and its rounds', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReviewStore.ReviewStore;

      yield* store.saveRound(root, 'demo', '001', '# round 001\n');
      yield* store.saveSeries(root, 'demo', '# ledger\n');

      Vitest.expect(yield* store.seriesNames(root)).toStrictEqual(['demo']);
      Vitest.expect(yield* store.roundNames(root, 'demo')).toStrictEqual(['001']);
      Vitest.expect(yield* store.readSeries(root, 'demo')).toBe('# ledger\n');
      Vitest.expect(yield* store.readRound(root, 'demo', '001')).toBe('# round 001\n');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('returns no series for an absent store', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReviewStore.ReviewStore;
      Vitest.expect(yield* store.seriesNames(root)).toStrictEqual([]);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('fails with an actionable message for an unknown series', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReviewStore.ReviewStore;
      const failure = yield* store.readSeries(root, 'nope').pipe(Effect.flip);
      Vitest.expect(failure.reason).toContain("No review series 'nope'");
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('sorts rounds by directory name', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReviewStore.ReviewStore;
      yield* store.saveRound(root, 'demo', '002', 'b\n');
      yield* store.saveRound(root, 'demo', '001', 'a\n');
      Vitest.expect(yield* store.roundNames(root, 'demo')).toStrictEqual(['001', '002']);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
