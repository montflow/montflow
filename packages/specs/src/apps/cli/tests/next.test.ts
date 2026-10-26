import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { next, renderNext, renderState, state } from '../index.js';
import { REPO_SIZING, SPEC_SIZING, entry, memory, stubLayer } from './helpers.js';

const GATES = ['## Stage 0: Core', '', '- [ ] Tests pass', ''].join('\n');

interface TreeOptions {
  readonly a001: string;
  readonly a002: string;
  readonly a099: string;
  readonly locked?: string;
  readonly specStatus?: string;
  readonly gatesA001?: boolean;
}

/** Build a two-execution-task phase with its review task. */
const tree = (options: TreeOptions): ReadonlyArray<SpecFileEntry> => [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'ship-spec',
      status: options.specStatus ?? 'in-progress',
      lockedPhases: options.locked ?? '',
      rows: [
        {
          id: 'A001',
          name: 'build',
          type: 'execution',
          status: options.a001,
          gates: options.gatesA001 === true ? 'Yes' : 'No',
        },
        { id: 'A002', name: 'wire', type: 'execution', status: options.a002, gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: options.a099, gates: 'No' },
      ],
    }),
  ),
  entry('A001-build/TASK.md', taskMarkdown({ id: 'A001', name: 'build', status: options.a001 })),
  entry('A001-build/MEMORY.md', memory),
  ...(options.gatesA001 === true ? [entry('A001-build/GATES.md', GATES)] : []),
  entry(
    'A002-wire/TASK.md',
    taskMarkdown({ id: 'A002', name: 'wire', dependsOn: 'A001', status: options.a002 }),
  ),
  entry('A002-wire/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: options.a099 }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const layer = (files: ReadonlyArray<SpecFileEntry>) => stubLayer(new Map([['ship-spec', files]]));

const runNext = (files: ReadonlyArray<SpecFileEntry>) =>
  next('.agents/@montflow/specs', 'ship-spec').pipe(Effect.provide(layer(files)));

const runState = (files: ReadonlyArray<SpecFileEntry>) =>
  state('.agents/@montflow/specs', 'ship-spec').pipe(Effect.provide(layer(files)));

Vitest.describe('Cli.state runtime', () => {
  Vitest.it.effect('reports the active phase and no locks', () =>
    Effect.gen(function* () {
      const report = yield* runState(tree({ a001: 'pending', a002: 'pending', a099: 'pending' }));
      Vitest.expect(report.state).toBe('pending');
      Vitest.expect(report.phase).toBe('A');
      Vitest.expect(report.lockedPhases).toStrictEqual([]);
      Vitest.expect(renderState(report)).toBe(
        'ship-spec · in-progress · state pending · phase A · locked none',
      );
    }),
  );
});

Vitest.describe('Cli.next runtime', () => {
  Vitest.it.effect('offers the dependency-free task first', () =>
    Effect.gen(function* () {
      const report = yield* runNext(tree({ a001: 'pending', a002: 'pending', a099: 'pending' }));
      Vitest.expect(report.phase).toBe('A');
      Vitest.expect(report.ready.map((task) => task.id)).toStrictEqual(['A001']);
    }),
  );

  Vitest.it.effect('marks a gated task', () =>
    Effect.gen(function* () {
      const report = yield* runNext(
        tree({ a001: 'pending', a002: 'pending', a099: 'pending', gatesA001: true }),
      );
      Vitest.expect(report.ready[0]?.gates).toBe(true);
      Vitest.expect(renderNext(report)).toContain('A001  gated  execution  build');
    }),
  );

  Vitest.it.effect('unblocks the dependent task once its target completes', () =>
    Effect.gen(function* () {
      const report = yield* runNext(tree({ a001: 'complete', a002: 'pending', a099: 'pending' }));
      Vitest.expect(report.ready.map((task) => task.id)).toStrictEqual(['A002']);
    }),
  );

  Vitest.it.effect('offers the review only once the phase work is complete', () =>
    Effect.gen(function* () {
      const report = yield* runNext(tree({ a001: 'complete', a002: 'complete', a099: 'pending' }));
      Vitest.expect(report.ready.map((task) => task.id)).toStrictEqual(['A099']);
    }),
  );

  Vitest.it.effect('has no ready set for a complete spec', () =>
    Effect.gen(function* () {
      const report = yield* runNext(
        tree({
          a001: 'complete',
          a002: 'complete',
          a099: 'complete',
          locked: 'A',
          specStatus: 'complete',
        }),
      );
      Vitest.expect(report.state).toBe('complete');
      Vitest.expect(report.ready).toStrictEqual([]);
      Vitest.expect(renderNext(report)).toBe('state complete\nready none');
    }),
  );
});

/** Sizing knobs for the ready-set cases. */
interface SizedNextOptions {
  readonly repo?: string;
  readonly specSizing?: string;
  readonly a001: string;
  readonly a002: string;
  readonly a099: string;
}

/** Build the two-execution-task phase A with declared sizes. */
const sizedTree = (options: SizedNextOptions): ReadonlyArray<SpecFileEntry> => [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'ship-spec',
      rows: [
        { id: 'A001', name: 'build', type: 'execution', status: options.a001, gates: 'No' },
        { id: 'A002', name: 'wire', type: 'execution', status: options.a002, gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: options.a099, gates: 'No' },
      ],
    }),
  ),
  ...(options.specSizing === undefined ? [] : [entry('sizing.json', options.specSizing)]),
  entry(
    'A001-build/TASK.md',
    taskMarkdown({ id: 'A001', name: 'build', size: 'tiny', status: options.a001 }),
  ),
  entry('A001-build/MEMORY.md', memory),
  entry(
    'A002-wire/TASK.md',
    taskMarkdown({
      id: 'A002',
      name: 'wire',
      size: 'small',
      dependsOn: 'A001',
      status: options.a002,
    }),
  ),
  entry('A002-wire/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({
      id: 'A099',
      name: 'review-phase',
      type: 'review',
      size: 'medium',
      status: options.a099,
    }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const runSizedNext = (options: SizedNextOptions) =>
  next('.agents/@montflow/specs', 'ship-spec').pipe(
    Effect.provide(
      stubLayer(
        new Map([['ship-spec', sizedTree(options)]]),
        options.repo === undefined ? new Map() : new Map([['sizing.json', options.repo]]),
      ),
    ),
  );

Vitest.describe('Cli.next sizing runtime', () => {
  Vitest.it.effect('carries the phase budget and the ready task target', () =>
    Effect.gen(function* () {
      const report = yield* runSizedNext({
        repo: REPO_SIZING,
        specSizing: SPEC_SIZING,
        a001: 'pending',
        a002: 'pending',
        a099: 'pending',
      });
      const text = renderNext(report);
      Vitest.expect(report.budget).toBe(2);
      Vitest.expect(text.split('\n')[0]).toBe('state pending · phase A · budget 2');
      Vitest.expect(text).toContain(
        'A001  execution  build  tiny  fixture/phase-model#high  phase',
      );
    }),
  );

  Vitest.it.effect('resolves the spec layer for the unblocked task', () =>
    Effect.gen(function* () {
      const report = yield* runSizedNext({
        repo: REPO_SIZING,
        specSizing: SPEC_SIZING,
        a001: 'complete',
        a002: 'pending',
        a099: 'pending',
      });
      const text = renderNext(report);
      Vitest.expect(text).toContain('A002  execution  wire  small  fixture/spec-model  spec');
    }),
  );

  Vitest.it.effect('lets the review task inherit', () =>
    Effect.gen(function* () {
      const report = yield* runSizedNext({
        a001: 'complete',
        a002: 'complete',
        a099: 'pending',
      });
      Vitest.expect(renderNext(report)).toContain('A099  review  review-phase  medium  inherit');
    }),
  );

  Vitest.it.effect('names the repo layer when only the repo config exists', () =>
    Effect.gen(function* () {
      const report = yield* runSizedNext({
        repo: REPO_SIZING,
        a001: 'pending',
        a002: 'pending',
        a099: 'pending',
      });
      Vitest.expect(renderNext(report)).toContain(
        'A001  execution  build  tiny  fixture/repo-model#low  repo',
      );
    }),
  );

  Vitest.it.effect('omits targets when the config is invalid', () =>
    Effect.gen(function* () {
      const report = yield* runSizedNext({
        specSizing: '{ not json',
        a001: 'pending',
        a002: 'pending',
        a099: 'pending',
      });
      Vitest.expect(renderNext(report)).toBe(
        'state pending · phase A · budget 2\nA001  execution  build',
      );
    }),
  );
});
