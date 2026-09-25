import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { FeatureStore } from '../index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('FeatureStore runtime', () => {
  Vitest.it.effect('lists feature directories and snapshots their files', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, 'ship-feature', 'A001-implement-login'), {
        recursive: true,
      });
      yield* fs.writeFileString(path.join(root, 'ship-feature', 'FEATURE.md'), '# Feature\n');
      yield* fs.writeFileString(
        path.join(root, 'ship-feature', 'A001-implement-login', 'TASK.md'),
        '# Task\n',
      );
      yield* fs.writeFileString(path.join(root, '.hidden'), 'skip me\n');

      const store = yield* FeatureStore.FeatureStore;
      Vitest.expect(yield* store.hasRoot(root)).toBe(true);
      Vitest.expect(yield* store.exists(root, 'ship-feature')).toBe(true);
      Vitest.expect(yield* store.exists(root, 'nope')).toBe(false);
      Vitest.expect(yield* store.names(root)).toStrictEqual(['ship-feature']);

      const snapshot = yield* store.snapshot(root, 'ship-feature');
      Vitest.expect(snapshot.name).toBe('ship-feature');
      Vitest.expect(snapshot.files.map((file) => file.path).toSorted()).toStrictEqual([
        'A001-implement-login/TASK.md',
        'FEATURE.md',
      ]);
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reports a missing root as absent', () =>
    Effect.gen(function* () {
      const store = yield* FeatureStore.FeatureStore;
      Vitest.expect(yield* store.hasRoot('/tmp/pi-features-definitely-missing')).toBe(false);
    }).pipe(Effect.provide(FeatureStore.Default), Effect.provide(PlatformLayer)),
  );
});
