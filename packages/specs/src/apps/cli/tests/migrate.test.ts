import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { NO_REVIEW, type SpecFileEntry, verifySpecTree } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import { check, migrate, planMigration, renderMigrate, runSlash, state } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';
const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** A flat, mechanically valid one-phase v1 spec. */
const flatSpec = (name = 'ship-login'): ReadonlyArray<SpecFileEntry> => [
  entry(
    'SPEC.md',
    specMarkdown({
      name,
      version: null,
      rows: [
        { id: 'A001', name: 'implement-login', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A002', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ),
  entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A002-review-phase/TASK.md',
    taskMarkdown({ id: 'A002', name: 'review-phase', type: 'review' }),
  ),
  entry('A002-review-phase/MEMORY.md', memory),
];

/** The same v1 spec already in phase directories, with no PHASE.md. */
const phaseTree = (name = 'ship-login'): ReadonlyArray<SpecFileEntry> =>
  flatSpec(name).map((file) => ({
    ...file,
    path: file.path === 'SPEC.md' ? file.path : `A/${file.path}`,
  }));

/** The phase tree with every task complete, for the frozen-upgrade tests. */
const completePhaseTree = (name = 'ship-login'): ReadonlyArray<SpecFileEntry> =>
  phaseTree(name).map((file) =>
    file.path === 'SPEC.md'
      ? entry(
          'SPEC.md',
          specMarkdown({
            name,
            status: 'complete',
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'complete',
                gates: 'No',
              },
              {
                id: 'A002',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
                gates: 'No',
              },
            ],
          }),
        )
      : {
          ...file,
          content: file.content
            .replace('status: pending', 'status: complete')
            .replace('- [ ]', '- [x]'),
        },
  );

/** A v2 tree: the phase record is present and the version is current. */
const v2Tree = (name = 'ship-login'): ReadonlyArray<SpecFileEntry> => [
  entry(
    'SPEC.md',
    specMarkdown({
      name,
      version: '2',
      rows: [
        { id: 'A001', name: 'implement-login', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A002', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ),
  entry('A/PHASE.md', phaseMarkdown()),
  entry('A/MEMORY.md', memory),
  entry('A/A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A/A001-implement-login/MEMORY.md', memory),
  entry(
    'A/A002-review-phase/TASK.md',
    taskMarkdown({ id: 'A002', name: 'review-phase', type: 'review' }),
  ),
  entry('A/A002-review-phase/MEMORY.md', memory),
];

Vitest.describe('Cli.planMigration runtime', () => {
  Vitest.it('plans one move per flat task directory', () => {
    const plan = planMigration({ name: 'ship-login', files: flatSpec() });
    Vitest.expect(plan).toStrictEqual({
      kind: 'migrate',
      moves: [
        { from: 'A001-implement-login', to: 'A/A001-implement-login' },
        { from: 'A002-review-phase', to: 'A/A002-review-phase' },
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
      'A/A002-review-phase',
      'B/B001-second',
    ]);
  });

  Vitest.it('plans an upgrade for a phase tree with no version', () => {
    Vitest.expect(planMigration({ name: 'ship-login', files: phaseTree() })).toStrictEqual({
      kind: 'upgrade',
    });
  });

  Vitest.it('reports an already-upgraded v2 tree', () => {
    const snapshot = { name: 'ship-login', files: v2Tree() };
    Vitest.expect(planMigration(snapshot)).toStrictEqual({ kind: 'already' });
  });

  Vitest.it('freezes a complete spec unless it is included explicitly', () => {
    const files = v2Tree().map((file) =>
      file.path === 'SPEC.md'
        ? entry(
            'SPEC.md',
            specMarkdown({
              name: 'ship-login',
              status: 'complete',
              rows: [
                {
                  id: 'A001',
                  name: 'implement-login',
                  type: 'execution',
                  status: 'complete',
                  gates: 'No',
                },
              ],
            }),
          )
        : file,
    );
    Vitest.expect(planMigration({ name: 'ship-login', files })).toStrictEqual({ kind: 'frozen' });
    Vitest.expect(
      planMigration({ name: 'ship-login', files }, { includeComplete: true }),
    ).not.toStrictEqual({ kind: 'frozen' });
  });

  Vitest.it('refuses a future version before planning any write', () => {
    const files = v2Tree().map((file) =>
      file.path === 'SPEC.md'
        ? entry('SPEC.md', specMarkdown({ name: 'ship-login', version: '3' }))
        : file,
    );
    const plan = planMigration({ name: 'ship-login', files });
    Vitest.expect(plan.kind).toBe('refused');
    Vitest.expect(plan.kind === 'refused' ? plan.reason : '').toContain('above the supported');
  });

  Vitest.it('refuses a mixed tree', () => {
    const files = [...flatSpec(), entry('B/B001-second/TASK.md', '')];
    Vitest.expect(planMigration({ name: 'ship-login', files })).toStrictEqual({
      kind: 'refused',
      reason:
        "Spec 'ship-login' mixes task directories at the root with phase directories; resolve it by hand.",
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
  Vitest.it.effect('migrates a flat v1 fixture into the v2 tree', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', flatSpec()]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('migrated');
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);
      const files = specs.get('ship-login') ?? [];
      const paths = files.map((file) => file.path);
      Vitest.expect(paths).toContain('A/A001-implement-login/TASK.md');
      Vitest.expect(paths).toContain('A/PHASE.md');
      Vitest.expect(paths).toContain('A/MEMORY.md');
      Vitest.expect(paths).not.toContain('A001-implement-login/TASK.md');
      const spec = files.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(spec).toContain('spec-version: 2');
      const phase = files.find((file) => file.path === 'A/PHASE.md')?.content ?? '';
      Vitest.expect(phase).toContain('review: required');
      Vitest.expect(phase).toContain('status: pending');

      const result = verifySpecTree({ name: 'ship-login', files }, NO_REVIEW);
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.issues).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('upgrades a v1 phase tree and adds the version line last', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', phaseTree()]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('upgraded');
      Vitest.expect(report.specs[0]?.writes).toContain('A/PHASE.md');
      Vitest.expect(report.specs[0]?.writes).toContain('SPEC.md');
      const files = specs.get('ship-login') ?? [];
      const spec = files.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(spec).toContain('spec-version: 2');
      Vitest.expect(files.map((file) => file.path)).toContain('A/MEMORY.md');
      const result = verifySpecTree({ name: 'ship-login', files }, NO_REVIEW);
      Vitest.expect(result.valid).toBe(true);
    }),
  );

  Vitest.it.effect('deletes the hand-written locked-phases field on the v2 upgrade', () =>
    Effect.gen(function* () {
      const tree = phaseTree().map((file) =>
        file.path === 'SPEC.md'
          ? {
              ...file,
              content: file.content.replace(
                'created: 2026-01-01',
                'created: 2026-01-01\nlocked-phases: A',
              ),
            }
          : file,
      );
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', tree]]);
      yield* migrate(root, { name: 'ship-login' }).pipe(Effect.provide(stubLayer(specs)));
      const spec = specs.get('ship-login')?.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(spec).toContain('spec-version: 2');
      Vitest.expect(spec).not.toContain('locked-phases');
    }),
  );

  Vitest.it.effect('is a no-op on an already-upgraded spec', () =>
    Effect.gen(function* () {
      const files = v2Tree();
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('already');
      Vitest.expect(specs.get('ship-login')).toStrictEqual(files);
    }),
  );

  Vitest.it.effect('reports a complete spec as frozen unless included', () =>
    Effect.gen(function* () {
      const files: ReadonlyArray<SpecFileEntry> = [
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'ship-login',
            status: 'complete',
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'complete',
                gates: 'No',
              },
            ],
          }),
        ),
        entry('A/PHASE.md', phaseMarkdown({ status: 'complete' })),
        entry('A/MEMORY.md', memory),
        entry(
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', status: 'complete' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
      ];
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('frozen');
      Vitest.expect(specs.get('ship-login')).toStrictEqual(files);
    }),
  );

  Vitest.it.effect('dry-run writes nothing and lists the upgrade writes', () =>
    Effect.gen(function* () {
      const before = phaseTree();
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', before]]);
      const report = yield* migrate(root, { name: 'ship-login', dryRun: true }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('planned');
      Vitest.expect(report.specs[0]?.writes).toContain('A/PHASE.md');
      Vitest.expect(specs.get('ship-login')).toBe(before);
      Vitest.expect(renderMigrate(report)).toContain("would write 'A/PHASE.md'");
    }),
  );

  Vitest.it.effect('refuses a future version without writing anything', () =>
    Effect.gen(function* () {
      const files = v2Tree().map((file) =>
        file.path === 'SPEC.md'
          ? entry('SPEC.md', specMarkdown({ name: 'ship-login', version: '3' }))
          : file,
      );
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

  Vitest.it.effect('rolls back the tree when the upgraded tree fails verification', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const store = yield* SpecStore.SpecStore;
      const files: ReadonlyArray<SpecFileEntry> = [
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'ship-login',
            version: null,
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'pending',
                gates: 'No',
              },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        // Deliberately no MEMORY.md: the moves and phase writes succeed, then
        // the post-write verifySpecTree call fails on the missing record.
      ];
      yield* store.write(dir, 'ship-login', files);
      const before = yield* store.snapshot(dir, 'ship-login');
      const beforePaths = before.files.map((file) => file.path).toSorted();

      const report = yield* migrate(dir, { name: 'ship-login' });

      Vitest.expect(report.specs[0]?.status).toBe('failed');
      Vitest.expect(report.specs[0]?.moves).toStrictEqual([]);
      Vitest.expect(
        report.specs[0]?.issues.some(
          (found) => found.field.includes('MEMORY.md') || found.message.includes('MEMORY.md'),
        ),
      ).toBe(true);
      Vitest.expect(report.specs[0]?.issues.at(-1)?.message).toContain('Migration rolled back');

      const after = yield* store.snapshot(dir, 'ship-login');
      Vitest.expect(after.files.map((file) => file.path).toSorted()).toStrictEqual(beforePaths);
      Vitest.expect(
        after.files.map((file) => file.path).some((path) => path.startsWith('A/')),
      ).toBe(false);
      const phaseDir = yield* fs.exists(`${dir}/ship-login/A`);
      Vitest.expect(phaseDir).toBe(false);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('preserves every original file byte across the migration', () =>
    Effect.gen(function* () {
      const before = flatSpec();
      const contents = before.filter((file) => file.path !== 'SPEC.md').map((file) => file.content);
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', before]]);
      yield* migrate(root, { name: 'ship-login' }).pipe(Effect.provide(stubLayer(specs)));
      const after = specs.get('ship-login') ?? [];
      for (const content of contents) {
        Vitest.expect(after.map((file) => file.content)).toContain(content);
      }
      Vitest.expect(after).toHaveLength(before.length + 2);
    }),
  );

  Vitest.it.effect('migrates a real tree and is idempotent', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const store = yield* SpecStore.SpecStore;
      yield* store.write(dir, 'ship-login', flatSpec());

      const report = yield* migrate(dir, { name: 'ship-login' });
      Vitest.expect(report.specs[0]?.status).toBe('migrated');
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);

      const after = yield* store.snapshot(dir, 'ship-login');
      Vitest.expect(after.files.map((file) => file.path)).toContain(
        'A/A001-implement-login/TASK.md',
      );
      Vitest.expect(verifySpecTree(after, NO_REVIEW).valid).toBe(true);

      const again = yield* migrate(dir, { name: 'ship-login' });
      Vitest.expect(again.specs[0]?.status).toBe('already');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it('re-ids a colliding flat task id and rewrites its references', () => {
    const files = [
      entry(
        'SPEC.md',
        specMarkdown({
          name: 'ship-login',
          version: null,
          rows: [
            { id: 'A001', name: 'one', type: 'execution', status: 'pending', gates: 'No' },
            { id: 'A001', name: 'two', type: 'execution', status: 'pending', gates: 'No' },
          ],
        }),
      ),
      entry('A001-one/TASK.md', taskMarkdown({ id: 'A001', name: 'one' })),
      entry('A001-one/MEMORY.md', memory),
      entry('A001-two/TASK.md', taskMarkdown({ id: 'A001', name: 'two', dependsOn: 'A001' })),
      entry('A001-two/MEMORY.md', memory),
    ];
    const plan = planMigration({ name: 'ship-login', files });
    Vitest.expect(plan.kind).toBe('migrate');
    if (plan.kind !== 'migrate') return;
    Vitest.expect(plan.moves[1]?.oldId).toBe('A001');
    Vitest.expect(plan.moves[1]?.newId).toBe('A002');
    Vitest.expect(plan.moves[1]?.to).toBe('A/A002-two');
  });

  Vitest.it.effect('writes the renumbered id into TASK.md and the SPEC.md rows', () =>
    Effect.gen(function* () {
      const files = [
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'ship-login',
            version: null,
            rows: [
              { id: 'A001', name: 'one', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A001', name: 'two', type: 'execution', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A001-one/TASK.md', taskMarkdown({ id: 'A001', name: 'one' })),
        entry('A001-one/MEMORY.md', memory),
        entry('A001-two/TASK.md', taskMarkdown({ id: 'A001', name: 'two', dependsOn: 'A001' })),
        entry('A001-two/MEMORY.md', memory),
      ];
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs[0]?.status).toBe('migrated');
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);
      const after = specs.get('ship-login') ?? [];
      const two = after.find((file) => file.path === 'A/A002-two/TASK.md')?.content ?? '';
      Vitest.expect(two).toContain('id: A002');
      Vitest.expect(two).toContain('depends-on: A001');
      Vitest.expect(verifySpecTree({ name: 'ship-login', files: after }, NO_REVIEW).valid).toBe(
        true,
      );
    }),
  );

  Vitest.it.effect('upgrades a complete fixture only with includeComplete', () =>
    Effect.gen(function* () {
      const files = completePhaseTree();
      const frozen = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const skipped = yield* migrate(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(frozen)),
      );
      Vitest.expect(skipped.specs[0]?.status).toBe('frozen');
      Vitest.expect(frozen.get('ship-login')).toBe(files);

      const upgraded = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', files]]);
      const report = yield* migrate(root, { name: 'ship-login', includeComplete: true }).pipe(
        Effect.provide(stubLayer(upgraded)),
      );
      Vitest.expect(report.specs[0]?.issues.map((found) => found.message)).toStrictEqual([]);
      Vitest.expect(report.specs[0]?.status).toBe('upgraded');
      Vitest.expect(upgraded.get('ship-login')?.map((file) => file.path)).toContain('A/PHASE.md');
    }),
  );

  Vitest.it.effect('flags a complete v1 record migrated to v2 with no review round', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([
        ['ship-login', completePhaseTree()],
      ]);
      yield* migrate(root, { name: 'ship-login', includeComplete: true }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      const migrated = specs.get('ship-login') ?? [];
      const specText = migrated.find((file) => file.path === 'SPEC.md')?.content ?? '';
      Vitest.expect(specText).not.toContain('## Creation');

      const report = yield* check(root, { name: 'ship-login' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(
        report.specs[0]?.issues.some((issueFound) => issueFound.field === 'review-series'),
      ).toBe(true);

      const derived = yield* state(root, 'ship-login').pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(derived.state).toBe('inconsistent');
      Vitest.expect(derived.blocked).toBe(true);
    }),
  );

  Vitest.it.effect('runs through the slash form', () =>
    Effect.gen(function* () {
      const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([['ship-login', flatSpec()]]);
      const report = yield* runSlash('migrate --name ship-login --dry-run', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain("would move 'A001-implement-login'");
      Vitest.expect(specs.get('ship-login')).toStrictEqual(flatSpec());
    }),
  );
});
