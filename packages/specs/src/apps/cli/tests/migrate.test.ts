import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import { migrate, planMigration, renderMigrate, runSlash } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';
const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** A flat, mechanically valid one-phase spec. */
const flatSpec = (name = 'ship-login'): ReadonlyArray<SpecFileEntry> => [
  entry('SPEC.md', specMarkdown({ name })),
  entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

Vitest.describe('Cli.planMigration runtime', () => {
  Vitest.it('plans one move per flat task directory', () => {
    const plan = planMigration({ name: 'ship-login', files: flatSpec() });
    Vitest.expect(plan).toStrictEqual({
      kind: 'migrate',
      moves: [
        { from: 'A001-implement-login', to: 'A/A001-implement-login' },
        { from: 'A099-review-phase', to: 'A/A099-review-phase' },
      ],
    });
  });

  Vitest.it('sorts phases by rank across two phases', () => {
    const files = [
      ...flatSpec(),
      entry('B001-second/TASK.md', taskMarkdown({ id: 'B001', name: 'second' })),
      entry('B001-second/MEMORY.md', memory),
    ];
    const plan = planMigration({ name: 'ship-login', files });
    Vitest.expect(plan.kind).toBe('migrate');
    Vitest.expect(plan.kind === 'migrate' ? plan.moves.map((move) => move.to) : []).toEqual([
      'A/A001-implement-login',
      'A/A099-review-phase',
      'B/B001-second',
    ]);
  });

  Vitest.it('refuses a mixed tree', () => {
    const files = [...flatSpec(), entry('B/B001-second/TASK.md', '')];
    Vitest.expect(planMigration({ name: 'ship-login', files })).toStrictEqual({
      kind: 'refused',
      reason:
        "Spec 'ship-login' mixes task directories at the root with phase directories; resolve it by hand.",
    });
  });

  Vitest.it('reports an already-migrated tree', () => {
    const files = flatSpec().map((file) => ({
      ...file,
      path: file.path === 'SPEC.md' ? file.path : `A/${file.path}`,
    }));
    Vitest.expect(planMigration({ name: 'ship-login', files })).toStrictEqual({
      kind: 'already',
    });
  });

  Vitest.it('refuses a tree with no task directories', () => {
    const plan = planMigration({
      name: 'ship-login',
      files: [entry('SPEC.md', specMarkdown({ name: 'ship-login' }))],
    });
    Vitest.expect(plan.kind).toBe('refused');
  });

  Vitest.it('refuses an unparsable task-looking directory', () => {
    const plan = planMigration({
      name: 'ship-login',
      files: [...flatSpec(), entry('A1-bad/TASK.md', '')],
    });
    Vitest.expect(plan).toStrictEqual({
      kind: 'refused',
      reason:
        "Spec 'ship-login' has an unexpected root directory 'A1-bad'; expected a task directory or a phase directory.",
    });
  });

  Vitest.it('refuses a stray root file', () => {
    const plan = planMigration({
      name: 'ship-login',
      files: [...flatSpec(), entry('notes.txt', 'scratch')],
    });
    Vitest.expect(plan).toStrictEqual({
      kind: 'refused',
      reason:
        "Spec 'ship-login' has an unexpected root file 'notes.txt'; move or remove it before migrating.",
    });
  });
});

Vitest.describe('Cli.migrate engine', () => {
  Vitest.it.effect('migrates a flat spec and verifies the result', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', flatSpec()]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);
      Vitest.expect(report.specs[0]?.status).toBe('migrated');
      const paths = (specs.get('ship-login') ?? []).map((file) => file.path);
      Vitest.expect(paths).toContain('A/A001-implement-login/TASK.md');
      Vitest.expect(paths).toContain('A/A099-review-phase/MEMORY.md');
      Vitest.expect(paths).not.toContain('A001-implement-login/TASK.md');
    }),
  );

  Vitest.it.effect('dry-run writes nothing', () =>
    Effect.gen(function* () {
      const before = flatSpec();
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', before]]);
      const report = yield* migrate(root, { name: 'ship-login', dryRun: true }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('planned');
      Vitest.expect(specs.get('ship-login')).toBe(before);
      Vitest.expect(renderMigrate(report)).toContain(
        "would move 'A001-implement-login' -> 'A/A001-implement-login'",
      );
    }),
  );

  Vitest.it.effect('is a no-op on an already-migrated spec', () =>
    Effect.gen(function* () {
      const files = flatSpec().map((file) => ({
        ...file,
        path: file.path === 'SPEC.md' ? file.path : `A/${file.path}`,
      }));
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('already');
      Vitest.expect(specs.get('ship-login')).toBe(files);
    }),
  );

  Vitest.it.effect('refuses a mixed tree without moving anything', () =>
    Effect.gen(function* () {
      const files = [...flatSpec(), entry('B/B001-second/TASK.md', '')];
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('refused');
      Vitest.expect(specs.get('ship-login')).toBe(files);
    }),
  );

  Vitest.it.effect('migrates every spec with --all', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([
        ['ship-login', flatSpec()],
        ['ship-signup', flatSpec('ship-signup')],
      ]);
      const report = yield* migrate(root, { all: true }).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.specs.map((spec) => spec.status)).toStrictEqual([
        'migrated',
        'migrated',
      ]);
    }),
  );

  Vitest.it.effect('fails an already-migrated tree that does not verify', () =>
    Effect.gen(function* () {
      const files: ReadonlyArray<SpecFileEntry> = [
        entry('SPEC.md', specMarkdown({ name: 'ship-login' })),
        entry('A/A001-implement/TASK.md', taskMarkdown({ id: 'A001', name: 'implement' })),
        entry('A/A001-implement/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
        { path: 'B', content: '', kind: 'directory' },
      ];
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('failed');
      Vitest.expect(report.specs[0]?.issues).toContainEqual({
        field: 'B',
        message: 'Phase directory has no task directories.',
      });
    }),
  );

  Vitest.it.effect('fails for an unknown spec', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>();
      const error = yield* migrate(root, { name: 'nope' }).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain("Spec 'nope' not found");
    }),
  );

  Vitest.it.effect('rolls back applied moves when a later move fails', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', flatSpec()]]);
      const base = stubLayer(specs);
      const failing = Layer.effect(
        SpecStore.SpecStore,
        SpecStore.SpecStore.pipe(
          Effect.map((store) =>
            SpecStore.SpecStore.of({
              ...store,
              move: (baseRoot, specName, from, to) =>
                to === 'A/A099-review-phase'
                  ? Effect.fail(
                      new SpecStore.StoreError({
                        operation: 'test',
                        reason: `blocked '${to}'`,
                      }),
                    )
                  : store.move(baseRoot, specName, from, to),
            }),
          ),
        ),
      ).pipe(Layer.provide(base));
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(Effect.provide(failing));
      Vitest.expect(report.specs[0]?.status).toBe('failed');
      Vitest.expect(report.specs[0]?.issues[0]?.message).toContain('Migration rolled back');
      const paths = (specs.get('ship-login') ?? []).map((file) => file.path);
      Vitest.expect(paths).toContain('A001-implement-login/TASK.md');
      Vitest.expect(paths).not.toContain('A/A001-implement-login/TASK.md');
    }),
  );

  Vitest.it.effect('preserves every file byte across the move', () =>
    Effect.gen(function* () {
      const before = flatSpec();
      const contents = before.map((file) => file.content).toSorted();
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', before]]);
      yield* migrate(root, { name: 'ship-login' }).pipe(Effect.provide(stubLayer(specs)));
      const after = (specs.get('ship-login') ?? []).map((file) => file.content).toSorted();
      Vitest.expect(after).toStrictEqual(contents);
      Vitest.expect(after).toHaveLength(before.length);
    }),
  );

  Vitest.it.effect('migrates a real tree without touching contents', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const store = yield* SpecStore.SpecStore;
      yield* store.write(dir, 'ship-login', flatSpec());
      const before = yield* store.snapshot(dir, 'ship-login');

      const report = yield* migrate(dir, { name: 'ship-login' });
      Vitest.expect(report.specs[0]?.status).toBe('migrated');
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);

      const after = yield* store.snapshot(dir, 'ship-login');
      Vitest.expect(
        after.files
          .filter((file) => file.kind === 'file')
          .map((file) => file.content)
          .toSorted(),
      ).toStrictEqual(
        before.files
          .filter((file) => (file.kind ?? 'file') === 'file')
          .map((file) => file.content)
          .toSorted(),
      );
      Vitest.expect(after.files.map((file) => file.path)).toContain(
        'A/A001-implement-login/TASK.md',
      );

      const again = yield* migrate(dir, { name: 'ship-login' });
      Vitest.expect(again.specs[0]?.status).toBe('already');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('runs through the slash form', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', flatSpec()]]);
      const report = yield* runSlash('migrate --name ship-login --dry-run', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain("would move 'A001-implement-login'");
      Vitest.expect(specs.get('ship-login')).toEqual(flatSpec());
    }),
  );
});
