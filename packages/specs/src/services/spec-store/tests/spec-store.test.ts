import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { SpecStore } from '../index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('SpecStore runtime', () => {
  Vitest.it.effect('snapshots files and directories', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, 'ship-spec', 'A', 'A001-implement-login'), {
        recursive: true,
      });
      yield* fs.makeDirectory(path.join(root, 'ship-spec', 'B'), { recursive: true });
      yield* fs.writeFileString(path.join(root, 'ship-spec', 'SPEC.md'), '# Spec\n');
      yield* fs.writeFileString(
        path.join(root, 'ship-spec', 'A', 'A001-implement-login', 'TASK.md'),
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
      Vitest.expect(snapshot.files.map((file) => [file.path, file.kind]).toSorted()).toStrictEqual([
        ['A', 'directory'],
        ['A/A001-implement-login', 'directory'],
        ['A/A001-implement-login/TASK.md', 'file'],
        ['B', 'directory'],
        ['SPEC.md', 'file'],
      ]);
      const empty = snapshot.files.find((file) => file.path === 'B');
      Vitest.expect(empty).toStrictEqual({ path: 'B', content: '', kind: 'directory' });
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reports a missing root as absent', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.hasRoot('/tmp/mf-specs-definitely-missing')).toBe(false);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('writes a fresh spec tree, creating the root', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped(), 'specs');
      const store = yield* SpecStore.SpecStore;

      yield* store.write(root, 'ship-login', [
        { path: 'SPEC.md', content: '# Spec\n' },
        { path: 'A001-implement/TASK.md', content: '# Task\n' },
      ]);

      Vitest.expect(yield* store.hasRoot(root)).toBe(true);
      const snapshot = yield* store.snapshot(root, 'ship-login');
      Vitest.expect(snapshot.files.map((file) => file.path).toSorted()).toStrictEqual([
        'A001-implement',
        'A001-implement/TASK.md',
        'SPEC.md',
      ]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('moves an entry and refuses an existing destination', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const store = yield* SpecStore.SpecStore;
      yield* store.write(root, 'ship-login', [
        { path: 'SPEC.md', content: '# Spec\n' },
        { path: 'A001-implement/TASK.md', content: '# Task\n' },
      ]);

      yield* store.move(root, 'ship-login', 'A001-implement', 'A/A001-implement');
      const snapshot = yield* store.snapshot(root, 'ship-login');
      Vitest.expect(snapshot.files.map((file) => file.path).toSorted()).toStrictEqual([
        'A',
        'A/A001-implement',
        'A/A001-implement/TASK.md',
        'SPEC.md',
      ]);

      const error = yield* store
        .move(root, 'ship-login', 'A/A001-implement', 'A/A001-implement')
        .pipe(Effect.flip);
      Vitest.expect(error.reason).toContain('already exists');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('removes an empty directory and refuses a non-empty one', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const store = yield* SpecStore.SpecStore;
      yield* store.write(root, 'ship-login', [
        { path: 'SPEC.md', content: '# Spec\n' },
        { path: 'A/A001-implement/TASK.md', content: '# Task\n' },
      ]);
      yield* fs.makeDirectory(path.join(root, 'ship-login', 'A', 'empty'), { recursive: true });

      const nonEmpty = yield* store
        .removeDirectory(root, 'ship-login', 'A/A001-implement')
        .pipe(Effect.flip);
      Vitest.expect(nonEmpty.reason).toContain('is not empty');

      yield* store.removeDirectory(root, 'ship-login', 'A/empty');
      const snapshot = yield* store.snapshot(root, 'ship-login');
      Vitest.expect(snapshot.files.map((file) => file.path)).not.toContain('A/empty');
      Vitest.expect(snapshot.files.map((file) => file.path)).toContain('A/A001-implement/TASK.md');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
});
