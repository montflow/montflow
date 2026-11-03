import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path, Scope } from 'effect';

import { phaseEvidence } from '../../../modules/phase/index.js';
import { SpecStore } from '../../../services/index.js';
import { claim, init, lockPhase } from '../index.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const root = '.agents/@montflow/specs';

const withWorkspace = <A, E>(
  body: (
    workspace: string,
  ) => Effect.Effect<A, E, SpecStore.SpecStore | FileSystem.FileSystem | Path.Path>,
): Effect.Effect<A, E, SpecStore.SpecStore | FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const workspace = yield* fs.makeTempDirectoryScoped().pipe(Effect.orDie);
    return yield* body(workspace);
  });

const read = (path: string): Effect.Effect<string, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path).pipe(Effect.orDie);
  });

Vitest.describe('Cli.claim runtime', () => {
  Vitest.it.effect('runs the full start/block/release/start graph and closes atomically', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        const specDir = `${storeRoot}/demo`;

        const bound = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        Vitest.expect(bound.form).toBe('orchestrator');

        const started = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
        });
        Vitest.expect(started.status).toBe('in-progress');
        Vitest.expect(yield* read(`${specDir}/A/A001-implement/TASK.md`)).toContain(
          'status: in-progress',
        );
        Vitest.expect(yield* read(`${specDir}/SPEC.md`)).toContain(
          '| A001 | implement | execution | in-progress | Yes |',
        );
        Vitest.expect(yield* read(`${specDir}/A/PHASE.md`)).toContain('status: in-progress');

        const blocked = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          block: true,
          reason: 'Waiting on the fixture',
          session: 'sess-orch',
        });
        Vitest.expect(blocked.status).toBe('blocked');
        const released = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          release: true,
          session: 'sess-orch',
        });
        Vitest.expect(released.status).toBe('pending');
        const restarted = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
        });
        Vitest.expect(restarted.status).toBe('in-progress');

        const taskPath = `${specDir}/A/A001-implement/TASK.md`;
        const gatePath = `${specDir}/A/A001-implement/GATES.md`;
        const fs = yield* FileSystem.FileSystem;
        const task = (yield* read(taskPath)).replace('- [ ] Done.', '- [x] Done.');
        yield* fs.writeFileString(taskPath, task);
        const command = /^command: (.+)$/m.exec(yield* read(gatePath))?.[1] ?? '';
        const record = JSON.stringify({
          stage: 0,
          title: 'Verification',
          kind: 'mechanical',
          command,
          exit: 0,
          verdict: 'pass',
          at: '2026-11-03T00:00:00Z',
          output: '',
        });
        yield* fs.writeFileString(`${specDir}/A/A001-implement/GATE-RESULTS.jsonl`, `${record}\n`);

        const closed = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          close: true,
          session: 'sess-orch',
        });
        Vitest.expect(closed.status).toBe('complete');
        Vitest.expect(yield* read(`${specDir}/SPEC.md`)).toContain('status: complete');
        Vitest.expect(yield* read(`${specDir}/SPEC.md`)).toContain(
          '| A001 | implement | execution | complete | Yes |',
        );
        const snapshot = yield* (yield* SpecStore.SpecStore).snapshot(storeRoot, 'demo');
        Vitest.expect(phaseEvidence(snapshot).waived).toContain('A');
        const lock = yield* lockPhase({ root: storeRoot, name: 'demo', phase: 'A' });
        Vitest.expect(lock.locked).toBe(true);
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to close an unchecked task and an unproven gate', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
        });
        const unchecked = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          close: true,
          session: 'sess-orch',
        }).pipe(Effect.result);
        Vitest.expect('failure' in unchecked).toBe(true);
        if ('failure' in unchecked) {
          Vitest.expect(
            'diagnostics' in unchecked.failure ? unchecked.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.completion-unchecked');
        }
        const fs = yield* FileSystem.FileSystem;
        const taskPath = `${storeRoot}/demo/A/A001-implement/TASK.md`;
        yield* fs.writeFileString(
          taskPath,
          (yield* fs.readFileString(taskPath)).replace('- [ ] Done.', '- [x] Done.'),
        );
        const unproven = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          close: true,
          session: 'sess-orch',
        }).pipe(Effect.result);
        Vitest.expect('failure' in unproven).toBe(true);
        if ('failure' in unproven) {
          Vitest.expect(
            'diagnostics' in unproven.failure ? unproven.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.gate-unproven');
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to close a task whose gate declares no classified stage', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
        });
        const fs = yield* FileSystem.FileSystem;
        const taskPath = `${storeRoot}/demo/A/A001-implement/TASK.md`;
        yield* fs.writeFileString(
          taskPath,
          (yield* fs.readFileString(taskPath)).replace('- [ ] Done.', '- [x] Done.'),
        );
        yield* fs.writeFileString(
          `${storeRoot}/demo/A/A001-implement/GATES.md`,
          ['# GATES', '', '## Stage 0: Static', '', '- [ ] Pass.', ''].join('\n'),
        );
        const result = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          close: true,
          session: 'sess-orch',
        }).pipe(Effect.result);
        Vitest.expect('failure' in result).toBe(true);
        if ('failure' in result) {
          Vitest.expect(
            'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.gate-unproven');
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a second claim of a taken task', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          session: 'sess-one',
        });
        const result = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          session: 'sess-two',
        }).pipe(Effect.result);
        Vitest.expect('failure' in result).toBe(true);
        if ('failure' in result) {
          Vitest.expect(
            'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.taken');
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('lets a worker bind and release its own session without a status change', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        const bound = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          session: 'sess-worker',
        });
        Vitest.expect(bound.transitioned).toBe(false);
        const released = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          release: true,
          session: 'sess-worker',
        });
        Vitest.expect(released.status).toBe('pending');
        Vitest.expect(released.transitioned).toBe(false);
        Vitest.expect(yield* read(`${storeRoot}/demo/A/A001-implement/TASK.md`)).toContain(
          'status: pending',
        );
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('denies a worker every transition form and changes nothing', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        for (const flag of ['start', 'block', 'close'] as const) {
          const result = yield* claim({
            root: storeRoot,
            workspace,
            name: 'demo',
            task: 'A001',
            [flag]: true,
            reason: 'denied',
            session: 'sess-worker',
          }).pipe(Effect.result);
          Vitest.expect('failure' in result).toBe(true);
          if ('failure' in result) {
            Vitest.expect(
              'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
            ).toBe('claim.not-orchestrator');
          }
        }
        Vitest.expect(yield* read(`${storeRoot}/demo/A/A001-implement/TASK.md`)).toContain(
          'status: pending',
        );
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('rolls all three records and the registry back when a rename fails', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        const specDir = `${storeRoot}/demo`;
        const before = new Map([
          [
            `${specDir}/A/A001-implement/TASK.md`,
            yield* read(`${specDir}/A/A001-implement/TASK.md`),
          ],
          [`${specDir}/SPEC.md`, yield* read(`${specDir}/SPEC.md`)],
          [`${specDir}/A/PHASE.md`, yield* read(`${specDir}/A/PHASE.md`)],
          [
            `${workspace}/.agents/@montflow/.runtime/claims.json`,
            yield* read(`${workspace}/.agents/@montflow/.runtime/claims.json`),
          ],
        ]);
        let failed = false;
        const fs = yield* FileSystem.FileSystem;
        const result = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
          transaction: {
            rename: (from, to, index) =>
              index === 2 && !failed
                ? Effect.sync(() => {
                    failed = true;
                  }).pipe(Effect.flatMap(() => Effect.fail(new Error('injected rename failure'))))
                : fs.rename(from, to),
          },
        }).pipe(Effect.result);
        Vitest.expect('failure' in result).toBe(true);
        if ('failure' in result) {
          Vitest.expect(
            'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.write-failed');
        }
        for (const [path, content] of before) {
          Vitest.expect(yield* read(path)).toBe(content);
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to close a v2 review task without a passing review', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
        const fs = yield* FileSystem.FileSystem;
        const work = `${storeRoot}/demo/A/A001-implement/TASK.md`;
        yield* fs.writeFileString(
          work,
          (yield* fs.readFileString(work)).replace('status: pending', 'status: complete'),
        );
        const review = `${storeRoot}/demo/A/A002-review-phase/TASK.md`;
        yield* fs.writeFileString(
          review,
          (yield* fs.readFileString(review)).replace('- [ ] Done.', '- [x] Done.'),
        );
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A002',
          start: true,
          session: 'sess-orch',
        });
        const result = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A002',
          close: true,
          session: 'sess-orch',
        }).pipe(Effect.result);
        Vitest.expect('failure' in result).toBe(true);
        if ('failure' in result) {
          Vitest.expect(
            'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.review-not-passed');
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('closes a review task on a terminal verdict before the round is closed', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
        const fs = yield* FileSystem.FileSystem;
        const work = `${storeRoot}/demo/A/A001-implement/TASK.md`;
        yield* fs.writeFileString(
          work,
          (yield* fs.readFileString(work)).replace('status: pending', 'status: complete'),
        );
        const review = `${storeRoot}/demo/A/A002-review-phase/TASK.md`;
        yield* fs.writeFileString(
          review,
          (yield* fs.readFileString(review)).replace('- [ ] Done.', '- [x] Done.'),
        );
        const round = `${workspace}/.agents/@montflow/reviews/demo/001/REVIEW.md`;
        yield* fs.makeDirectory(`${workspace}/.agents/@montflow/reviews/demo/001`, {
          recursive: true,
        });
        yield* fs.writeFileString(
          round,
          [
            '# Review: demo / 001',
            '',
            '## Metadata',
            '',
            '- Phase: A',
            '- Status: open',
            '',
            '## Findings',
            '',
            '### F1 — fixed',
            '',
            '- Severity: Major',
            '- Status: Resolved',
            '',
          ].join('\n'),
        );
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A002',
          start: true,
          session: 'sess-orch',
        });
        const closed = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A002',
          close: true,
          session: 'sess-orch',
        });
        Vitest.expect(closed.status).toBe('complete');
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to start a review task while its work is pending', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
        const fs = yield* FileSystem.FileSystem;
        const review = `${storeRoot}/demo/A/A002-review-phase/TASK.md`;
        yield* fs.writeFileString(
          review,
          (yield* fs.readFileString(review)).replace('depends-on: A001', 'depends-on:'),
        );
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        const result = yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A002',
          start: true,
          session: 'sess-orch',
        }).pipe(Effect.result);
        Vitest.expect('failure' in result).toBe(true);
        if ('failure' in result) {
          Vitest.expect(
            'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
          ).toBe('claim.not-ready');
        }
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );
});
