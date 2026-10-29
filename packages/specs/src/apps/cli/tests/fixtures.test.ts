import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { PromptStore } from '@montflow/prompts';
import { Effect, Layer } from 'effect';
import * as Sizing from '../../../modules/sizing/index.js';
import { NO_REVIEW, verifySpecTree } from '../../../modules/structure/index.js';
import { SpecStore } from '../../../services/index.js';
import {
  SurfaceError,
  check,
  dispatchErrorText,
  dispatchExitCode,
  execute,
  list,
  next,
  renderNext,
  status,
} from '../index.js';

const PlatformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.mergeAll(
  Layer.provide(SpecStore.Default, PlatformLayer),
  Layer.provide(PromptStore.Default, PlatformLayer),
  PlatformLayer,
);
const Root = 'fixtures/.agents/@montflow/specs';

Vitest.describe('CLI fixtures runtime', () => {
  Vitest.it.effect('mock-ok verifies clean', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const snapshot = yield* store.snapshot(Root, 'mock-ok');
      const result = verifySpecTree(snapshot, NO_REVIEW);
      Vitest.expect(result.issues).toStrictEqual([]);
      Vitest.expect(result.valid).toBe(true);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('mock-bad surfaces every failure class', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const snapshot = yield* store.snapshot(Root, 'mock-bad');
      const result = verifySpecTree(snapshot, NO_REVIEW);
      Vitest.expect(result.valid).toBe(false);
      const fields = result.issues.map((issue) => issue.field);
      Vitest.expect(fields).toContain('SPEC.md: tasks');
      Vitest.expect(fields).toContain('A002-explore-thing/MEMORY.md');
      Vitest.expect(fields).toContain('A003-bad-kind/TASK.md: type');
      Vitest.expect(fields).toContain('B001-late-thing/MEMORY.md: body');
      Vitest.expect(fields).toContain('B002-gated-thing/GATES.md: Stage 0: Core Validation');
      Vitest.expect(fields).toContain('task A001');
      Vitest.expect(fields).toContain('phase A');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
  Vitest.it.effect('mock-complete is fully consistent', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const result = verifySpecTree(yield* store.snapshot(Root, 'mock-complete'), NO_REVIEW);
      Vitest.expect(result.issues).toStrictEqual([]);
      Vitest.expect(result.valid).toBe(true);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('mock-stale is flagged as an inconsistent lifecycle', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const result = verifySpecTree(yield* store.snapshot(Root, 'mock-stale'), NO_REVIEW);
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues).toContainEqual({
        field: 'status',
        message:
          "All tasks are complete and all phases are locked, but spec status is 'in-progress'.",
      });
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('enforces the review budget from the fixture series', () =>
    Effect.gen(function* () {
      const history = yield* check(Root, { name: 'mock-history' });
      Vitest.expect(history.specs[0]?.issues).toStrictEqual([]);
      Vitest.expect(history.failed).toBe(0);

      const over = yield* check(Root, { name: 'mock-over-budget' });
      Vitest.expect(over.failed).toBe(1);
      Vitest.expect(over.specs[0]?.issues).toStrictEqual([
        {
          code: 'review.budget-exceeded',
          field: 'review-series',
          message:
            "Review series 'mock-over-budget' holds 4 rounds attributed to phase 'A'; the phase budget is 1.",
          expected: "at most 1 round for phase 'A'",
          actual: '4 rounds',
          fix: "Record the escalation in phase 'A' review task's MEMORY.md and ask the user; no further round may be opened in series 'mock-over-budget'. The budget is the largest non-review task size in phase 'A'.",
        },
      ]);
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('treats the repo sizing.json as a root file, not a spec', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const names = yield* store.names(Root);
      Vitest.expect(names).not.toContain('sizing.json');

      const text = yield* store.readRootFile(Root, 'sizing.json');
      Vitest.expect(text).toBeDefined();
      const repo = yield* Sizing.parse({ path: 'sizing.json', kind: 'repo' }, text ?? '');
      Vitest.expect(Sizing.resolve({ repo }, 'tiny')).toStrictEqual({
        size: 'tiny',
        target: 'fixture/repo-model#low',
        source: 'repo',
        entry: { model: 'fixture/repo-model', effort: 'low' },
      });
      Vitest.expect(Sizing.resolve({ repo }, 'large')).toStrictEqual({
        size: 'large',
        target: Sizing.INHERIT,
      });

      const report = yield* list(Root);
      Vitest.expect(report.specs.map((spec) => spec.name)).not.toContain('sizing.json');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('proves repo < spec < phase precedence from fixtures', () =>
    Effect.gen(function* () {
      const store = yield* SpecStore.SpecStore;
      const repoText = yield* store.readRootFile(Root, 'sizing.json');
      const repo = yield* Sizing.parse({ path: 'sizing.json', kind: 'repo' }, repoText ?? '');
      const snapshot = yield* store.snapshot(Root, 'mock-ok');
      const specFile = snapshot.files.find((file) => file.path === 'sizing.json');
      Vitest.expect(specFile).toBeDefined();
      const spec = yield* Sizing.parse(
        { path: 'mock-ok/sizing.json', kind: 'spec' },
        specFile?.content ?? '',
      );

      Vitest.expect(Sizing.resolve({ repo, spec, phase: 'A' }, 'tiny')).toStrictEqual({
        size: 'tiny',
        target: 'fixture/phase-model#high',
        source: 'phase',
        entry: { model: 'fixture/phase-model', effort: 'high' },
      });
      Vitest.expect(Sizing.resolve({ repo, spec, phase: 'A' }, 'small')).toStrictEqual({
        size: 'small',
        target: 'fixture/spec-model',
        source: 'spec',
        entry: { model: 'fixture/spec-model' },
      });
      Vitest.expect(Sizing.resolve({ repo, spec, phase: 'A' }, 'large')).toStrictEqual({
        size: 'large',
        target: Sizing.INHERIT,
      });
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
});

Vitest.describe('CLI fixtures dispatch truth', () => {
  Vitest.it.effect('next on mock-bad exits 1, prints the ready set, and lists blockers', () =>
    Effect.gen(function* () {
      const report = yield* next(Root, 'mock-bad');
      Vitest.expect(dispatchExitCode(report.sizing, report.verify, report.name)).toBe(1);
      Vitest.expect(renderNext(report)).toContain('state blocked');
      Vitest.expect(renderNext(report)).toContain('ready none');
      const blockers = dispatchErrorText(report.sizing, report.verify, 'mock-bad');
      Vitest.expect(blockers).toContain("Task 'A003' has unknown type 'chore'.");
      Vitest.expect(blockers).toContain('next     mf-specs check --name mock-bad');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('status and next agree on the same tree answer', () =>
    Effect.gen(function* () {
      const reported = yield* status(Root, 'mock-bad');
      const ready = yield* next(Root, 'mock-bad');
      Vitest.expect(dispatchExitCode(reported.sizing, reported.verify, reported.name)).toBe(
        dispatchExitCode(ready.sizing, ready.verify, ready.name),
      );
      Vitest.expect(new Set(reported.verify.issues.map((found) => found.field))).toStrictEqual(
        new Set(ready.verify.issues.map((found) => found.field)),
      );
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );

  Vitest.it.effect('check, status, next, and execute agree on the over-budget fixture', () =>
    Effect.gen(function* () {
      const checked = yield* check(Root, { name: 'mock-over-budget' });
      Vitest.expect(checked.failed).toBe(1);
      Vitest.expect(checked.specs[0]?.issues[0]?.code).toBe('review.budget-exceeded');

      const reported = yield* status(Root, 'mock-over-budget');
      Vitest.expect(dispatchExitCode(reported.sizing, reported.verify, reported.name)).toBe(1);
      Vitest.expect(dispatchErrorText(reported.sizing, reported.verify, reported.name)).toContain(
        'review.budget-exceeded',
      );

      const ready = yield* next(Root, 'mock-over-budget');
      Vitest.expect(dispatchExitCode(ready.sizing, ready.verify, ready.name)).toBe(1);
      Vitest.expect(renderNext(ready)).not.toContain('inherit');

      const error = yield* execute(Root, { name: 'mock-over-budget', workspace: '.' }).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics.map((found) => found.code)).toContain(
        'review.budget-exceeded',
      );
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('next on a valid spec still exits 0 with a ready set', () =>
    Effect.gen(function* () {
      const report = yield* next(Root, 'mock-ok');
      Vitest.expect(dispatchExitCode(report.sizing, report.verify, report.name)).toBe(0);
      Vitest.expect(renderNext(report)).toContain('A001  gated  execution  implement-thing');
      Vitest.expect(dispatchErrorText(report.sizing, report.verify, 'mock-ok')).toBe('');
    }).pipe(Effect.provide(SpecStore.Default), Effect.provide(PlatformLayer)),
  );
});
