import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { SpecStore } from '../index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('SpecStore runtime', () => {
  Vitest.it.effect('lists spec directories and snapshots their files', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, 'ship-spec', 'A001-implement-login'), {
        recursive: true,
      });
      yield* fs.writeFileString(path.join(root, 'ship-spec', 'SPEC.md'), '# Spec\n');
      yield* fs.writeFileString(
        path.join(root, 'ship-spec', 'A001-implement-login', 'TASK.md'),
        '# Task\n',
      );
      yield* fs.writeFileString(path.join(root, '.hidden'), 'skip me\n');

      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.hasRoot(root)).toBe(true);
      Vitest.expect(yield* store.exists(root, 'ship-spec')).toBe(true);
      Vitest.expect(yield* store.exists(root, 'nope')).toBe(false);
      Vitest.expect(yield* store.names(root)).toStrictEqual(['ship-spec']);

      const snapshot = yield* store.snapshot(root, 'ship-spec');
      Vitest.expect(snapshot.name).toBe('ship-spec');
      Vitest.expect(snapshot.files.map((file) => file.path).toSorted()).toStrictEqual([
        'A001-implement-login/TASK.md',
        'SPEC.md',
      ]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reports a missing root as absent', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.hasRoot('/tmp/pi-specs-definitely-missing')).toBe(false);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
});
