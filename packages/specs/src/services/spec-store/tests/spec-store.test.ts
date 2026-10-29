import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import Fs from 'node:fs';
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

  Vitest.it.effect('reads the linked review series and skips a round without REVIEW.md', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'mf-store-' }), 'specs');
      const reviews = path.join(path.dirname(root), 'reviews');
      const writeRound = (series: string, round: string, phase: string) =>
        Effect.gen(function* () {
          const target = path.join(reviews, series, round, 'REVIEW.md');
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* fs.writeFileString(target, `## Metadata\n\n- Phase: ${phase}\n`);
        });

      yield* writeRound('ship-spec', '001', 'A');
      yield* writeRound('ship-spec-effect-reviewer', '001', 'A');
      // A round directory with no REVIEW.md is absent, not unreadable.
      yield* fs.makeDirectory(path.join(reviews, 'ship-spec', '002'), { recursive: true });
      // The series ledger beside the rounds is not a round.
      yield* fs.writeFileString(path.join(reviews, 'ship-spec', 'REVIEW.md'), '# Ledger\n');
      // A series belonging to another spec is not linked.
      yield* writeRound('other-spec', '001', 'A');

      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.reviewSeries(root, 'ship-spec')).toStrictEqual([
        { name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] },
        { name: 'ship-spec-effect-reviewer', rounds: [{ round: '001', phase: 'A' }] },
      ]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reports a missing reviews directory as no series', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'mf-store-' }), 'specs');
      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.reviewSeries(root, 'ship-spec')).toStrictEqual([]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('fails an unreadable round file instead of dropping the round', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'mf-store-' }), 'specs');
      const target = path.join(path.dirname(root), 'reviews', 'ship-spec', '003', 'REVIEW.md');
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, '## Metadata\n\n- Phase: A\n');
      Fs.chmodSync(target, 0o000);

      const store = yield* SpecStore.SpecStore;
      const error = yield* store.reviewSeries(root, 'ship-spec').pipe(Effect.flip);
      // The failure is attributed to the review store with a store-relative
      // name, so `check` reports it instead of counting one round fewer.
      Vitest.expect(error.origin).toBe('reviews');
      Vitest.expect(error.path).toBe(target);
      Vitest.expect(error.reason).toContain('reviews/ship-spec/003/REVIEW.md');
      Vitest.expect(error.reason).toContain('PermissionDenied');
      Vitest.expect(error.reason).not.toContain(root);
      Vitest.expect(error.cause).toBeDefined();

      Fs.chmodSync(target, 0o644);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('fails an unreadable reviews directory instead of reporting no series', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'mf-store-' }), 'specs');
      const reviews = path.join(path.dirname(root), 'reviews');
      yield* fs.makeDirectory(reviews, { recursive: true });
      Fs.chmodSync(reviews, 0o000);

      const store = yield* SpecStore.SpecStore;
      const error = yield* store.reviewSeries(root, 'ship-spec').pipe(Effect.flip);
      Vitest.expect(error.origin).toBe('reviews');
      Vitest.expect(error.reason).toContain('reviews');

      Fs.chmodSync(reviews, 0o755);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('fails a reviews path that is not a directory', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'mf-store-' }), 'specs');
      yield* fs.writeFileString(path.join(path.dirname(root), 'reviews'), 'not a store\n');

      const store = yield* SpecStore.SpecStore;
      const error = yield* store.reviewSeries(root, 'ship-spec').pipe(Effect.flip);
      Vitest.expect(error.origin).toBe('reviews');
      Vitest.expect(error.reason).toContain('not a directory');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reports a missing root as absent', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.hasRoot('/tmp/specs-definitely-missing')).toBe(false);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('reads a root file, reporting an absent one as undefined', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, 'sizing.json'), '{ "sizes": {} }\n');

      const store = yield* SpecStore.SpecStore;
      Vitest.expect(yield* store.readRootFile(root, 'sizing.json')).toBe('{ "sizes": {} }\n');
      Vitest.expect(yield* store.readRootFile(root, 'missing.json')).toBeUndefined();
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
        'A001-implement/TASK.md',
        'SPEC.md',
      ]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
});
