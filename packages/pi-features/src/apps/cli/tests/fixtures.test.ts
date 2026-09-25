import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { verifyFeatureTree } from '../../../modules/structure/index.js';
import { FeatureStore } from '../../../services/index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const Root = 'fixtures/.agents/@montflow/features';

Vitest.describe('CLI fixtures runtime', () => {
  Vitest.it.effect('mock-ok verifies clean', () =>
    Effect.gen(function* () {
      const store = yield* FeatureStore.FeatureStore;
      const snapshot = yield* store.snapshot(Root, 'mock-ok');
      const result = verifyFeatureTree(snapshot);
      Vitest.expect(result.issues).toStrictEqual([]);
      Vitest.expect(result.valid).toBe(true);
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('mock-bad surfaces every failure class', () =>
    Effect.gen(function* () {
      const store = yield* FeatureStore.FeatureStore;
      const snapshot = yield* store.snapshot(Root, 'mock-bad');
      const result = verifyFeatureTree(snapshot);
      Vitest.expect(result.valid).toBe(false);
      const fields = result.issues.map((issue) => issue.field);
      Vitest.expect(fields).toContain('FEATURE.md: tasks');
      Vitest.expect(fields).toContain('A002-explore-thing/MEMORY.md');
      Vitest.expect(fields).toContain('A003-bad-kind/TASK.md: type');
      Vitest.expect(fields).toContain('B001-late-thing/MEMORY.md: body');
      Vitest.expect(fields).toContain('B002-gated-thing/GATES.md: Stage 0: Core Validation');
      Vitest.expect(fields).toContain('task A001');
      Vitest.expect(fields).toContain('phase A');
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );
  Vitest.it.effect('mock-complete is fully consistent', () =>
    Effect.gen(function* () {
      const store = yield* FeatureStore.FeatureStore;
      const result = verifyFeatureTree(yield* store.snapshot(Root, 'mock-complete'));
      Vitest.expect(result.issues).toStrictEqual([]);
      Vitest.expect(result.valid).toBe(true);
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('mock-stale is flagged as an inconsistent lifecycle', () =>
    Effect.gen(function* () {
      const store = yield* FeatureStore.FeatureStore;
      const result = verifyFeatureTree(yield* store.snapshot(Root, 'mock-stale'));
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues).toContainEqual({
        field: 'status',
        message:
          "All tasks are complete and all phases are locked, but feature status is 'in-progress'.",
      });
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );
});
