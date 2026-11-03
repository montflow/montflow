import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  check,
  claim,
  init,
  lockPhase,
  newTask,
  readTier,
  setWaiver,
  stampValue,
} from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const root = '.agents/@montflow/specs';

Vitest.describe('Cli.tier/stamp runtime', () => {
  Vitest.it.effect('prints the installed tier body when it matches the package', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const installed = path.join(dir, 'installed');
      const shipped = path.join(dir, 'shipped');
      yield* fs.makeDirectory(installed, { recursive: true });
      yield* fs.makeDirectory(shipped, { recursive: true });
      const body =
        '---\ntier: micro\n---\n\n# Tier: micro\n\nThis run may ask at most 0 questions.\n';
      yield* fs.writeFileString(path.join(installed, 'micro.md'), body);
      yield* fs.writeFileString(path.join(shipped, 'micro.md'), body);
      const value = yield* readTier({
        tier: 'micro',
        workspace: dir,
        installedDir: installed,
        shippedDir: shipped,
      });
      Vitest.expect(value).toBe(body);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a stale installed tier', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const installed = path.join(dir, 'installed');
      const shipped = path.join(dir, 'shipped');
      yield* fs.makeDirectory(installed, { recursive: true });
      yield* fs.makeDirectory(shipped, { recursive: true });
      yield* fs.writeFileString(path.join(installed, 'micro.md'), 'drifted');
      yield* fs.writeFileString(path.join(shipped, 'micro.md'), 'packaged');
      const result = yield* readTier({
        tier: 'micro',
        workspace: dir,
        installedDir: installed,
        shippedDir: shipped,
      }).pipe(Effect.result);
      Vitest.expect('failure' in result).toBe(true);
      if ('failure' in result) Vitest.expect(result.failure.code).toBe('tier.stale');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses an unknown tier before reading any file', () =>
    Effect.gen(function* () {
      const result = yield* readTier({ tier: 'split', workspace: '.' }).pipe(Effect.result);
      Vitest.expect('failure' in result).toBe(true);
      if ('failure' in result) Vitest.expect(result.failure.code).toBe('tier.unknown');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('stamps an instant and a date from the clock', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* stampValue('instant')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      Vitest.expect(yield* stampValue('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }),
  );
});

Vitest.describe('Cli.lock/waiver runtime', () => {
  Vitest.it.effect('reports the blocking codes for an unfinished phase', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
      const lock = yield* lockPhase({ root: storeRoot, name: 'demo', phase: 'A' });
      Vitest.expect(lock.locked).toBe(false);
      Vitest.expect(lock.blockers).toContain('task.pending');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a started phase whose memory has no valid execution brief', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'micro' });
      const phaseMemory = `${storeRoot}/demo/A/MEMORY.md`;
      const scaffolded = yield* fs.readFileString(phaseMemory);

      const fresh = yield* check(storeRoot, { name: 'demo' });
      Vitest.expect(fresh.failed).toBe(0);

      yield* fs.writeFileString(
        phaseMemory,
        scaffolded.replace(/\n## Execution Brief\s*[\s\S]*$/, '\n'),
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
        task: 'A001',
        start: true,
        session: 'sess-orch',
      });

      const refused = yield* lockPhase({ root: storeRoot, name: 'demo', phase: 'A' }).pipe(
        Effect.result,
      );
      Vitest.expect('failure' in refused).toBe(true);
      if ('failure' in refused) {
        const first = 'diagnostics' in refused.failure ? refused.failure.diagnostics[0] : undefined;
        Vitest.expect(first?.code).toBe('phase.execution-brief-missing');
        Vitest.expect(first?.fix).toBeTruthy();
      }

      yield* fs.writeFileString(phaseMemory, scaffolded);
      const restored = yield* lockPhase({ root: storeRoot, name: 'demo', phase: 'A' }).pipe(
        Effect.result,
      );
      Vitest.expect('success' in restored).toBe(true);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('writes a records-only waiver and recomputes its evidence', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({
        root: storeRoot,
        name: 'demo',
        tier: 'standard',
        phaseObjectives: ['Record the decision only'],
        taskFlags: ['A:plan:planning'],
        reviewFlags: ['A:waived'],
        reasonFlags: ['A:No code changes; the gate is the evidence.'],
      });
      const report = yield* setWaiver({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        waived: true,
        reason: 'No code changes; the gate is the evidence.',
      });
      Vitest.expect(report.review).toBe('waived');
      Vitest.expect(report.evidence).toContain('A001:0');
      const phase = yield* fs.readFileString(`${storeRoot}/demo/A/PHASE.md`);
      Vitest.expect(phase).toContain('review: waived');
      Vitest.expect(phase).toContain('review-evidence: A001:0');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to waive a standard phase holding execution work', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
      const result = yield* setWaiver({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        waived: true,
        reason: 'no review',
      }).pipe(Effect.result);
      Vitest.expect('failure' in result).toBe(true);
      if ('failure' in result) {
        Vitest.expect(
          'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
        ).toMatch(/waiver|review/);
      }
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a waiver when the v2 Creation tier record is absent', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({
        root: storeRoot,
        name: 'demo',
        tier: 'standard',
        taskFlags: ['A:plan:planning'],
        reviewFlags: ['A:waived'],
        reasonFlags: ['A:No code changes; the gate is the evidence.'],
      });
      const specPath = `${storeRoot}/demo/SPEC.md`;
      const spec = yield* fs.readFileString(specPath);
      yield* fs.writeFileString(specPath, spec.replace(/## Creation[\s\S]*?(?=## Tasks)/, ''));
      const result = yield* setWaiver({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        waived: true,
        reason: 'No code changes; the gate is the evidence.',
      }).pipe(Effect.result);
      Vitest.expect('failure' in result).toBe(true);
      if ('failure' in result) {
        Vitest.expect(
          'diagnostics' in result.failure ? result.failure.diagnostics[0]?.code : undefined,
        ).toBe('waiver.waiver-policy');
      }
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('confirms a frozen v1 lock from complete tasks and a closed round', () =>
    Effect.gen(function* () {
      const files = [
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'frozen',
            status: 'complete',
            version: null,
            rows: [
              {
                id: 'A001',
                name: 'build',
                type: 'execution',
                status: 'complete',
                gates: 'No',
              },
            ],
          }),
        ),
        entry(
          'A/A001-build/TASK.md',
          taskMarkdown({ id: 'A001', name: 'build', status: 'complete' }),
        ),
        entry('A/A001-build/MEMORY.md', memory),
      ];
      const report = yield* lockPhase({
        root: '.agents/@montflow/specs',
        name: 'frozen',
        phase: 'A',
      }).pipe(
        Effect.provide(
          stubLayer(new Map([['frozen', files]]), new Map(), {
            reviews: [{ name: 'frozen', rounds: [{ round: '001', phase: 'A', passed: true }] }],
          }),
        ),
      );
      Vitest.expect(report.locked).toBe(true);
    }),
  );

  Vitest.it.effect('allocates the next task number from disk and appends its row', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
      const first = yield* newTask({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        task: 'wire',
        type: 'execution',
        gates: true,
      });
      Vitest.expect(first.task).toBe('A003');
      const second = yield* newTask({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        task: 'ship',
        type: 'execution',
        gates: true,
      });
      Vitest.expect(second.task).toBe('A004');
      const spec = yield* fs.readFileString(`${storeRoot}/demo/SPEC.md`);
      Vitest.expect(spec).toContain('| A003 | wire | execution | pending | Yes |');
      Vitest.expect(spec.indexOf('A003')).toBeLessThan(spec.indexOf('A004'));
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('gives an execution task a GATES.md even without --gates', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
      const report = yield* newTask({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        task: 'wire',
        type: 'execution',
      });
      Vitest.expect(report.files).toContain('A/A003-wire/GATES.md');
      const spec = yield* fs.readFileString(`${storeRoot}/demo/SPEC.md`);
      Vitest.expect(spec).toContain('| A003 | wire | execution | pending | Yes |');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );

  Vitest.it.effect('adds work added after the review task to the review depends-on', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const storeRoot = `${workspace}/${root}`;
      yield* init({ root: storeRoot, name: 'demo', tier: 'standard' });
      yield* newTask({
        root: storeRoot,
        name: 'demo',
        phase: 'A',
        task: 'wire',
        type: 'planning',
      });
      const review = yield* fs.readFileString(`${storeRoot}/demo/A/A002-review-phase/TASK.md`);
      Vitest.expect(review).toContain('depends-on: A001, A003');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );
});
