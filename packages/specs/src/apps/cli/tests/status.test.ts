import * as Vitest from '@effect/vitest';
import { Cause, Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { warning } from '../../../modules/verify/index.js';
import { SpecStore } from '../../../services/index.js';
import {
  type StatusReport,
  NO_SIZING,
  SurfaceError,
  VALIDATION_EXIT_CODE,
  diagnoseCause,
  dispatchExitCode,
  renderStatus,
  status,
} from '../index.js';
import { REPO_SIZING, SPEC_SIZING, entry, memory, stubLayer } from './helpers.js';

/** Build the two-task spec used across the state cases. */
const tree = (specStatus: string, lockedPhases: string, a001: string, a099: string) => [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'ship-spec',
      status: specStatus,
      lockedPhases,
      rows: [
        { id: 'A001', name: 'implement-login', type: 'execution', status: a001, gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: a099, gates: 'No' },
      ],
    }),
  ),
  entry(
    'A001-implement-login/TASK.md',
    taskMarkdown({ id: 'A001', name: 'implement-login', status: a001 }),
  ),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: a099 }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const runStatus = (files: ReadonlyArray<SpecFileEntry>) =>
  status('.agents/@montflow/specs', 'ship-spec').pipe(
    Effect.provide(stubLayer(new Map([['ship-spec', files]]))),
  );

Vitest.describe('Cli.status runtime', () => {
  Vitest.it.effect('summarizes a spec', () =>
    Effect.gen(function* () {
      const result = yield* runStatus(tree('in-progress', '', 'pending', 'pending'));
      Vitest.expect(result.spec?.name).toBe('ship-spec');
      Vitest.expect(result.tasks.map((task) => task.id)).toStrictEqual(['A001', 'A099']);
    }),
  );

  Vitest.it.effect('renders an unreadable spec file as a coded store diagnostic', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.snapshot',
        reason: 'PermissionDenied: FileSystem.readFile (ship-spec/sizing.json)',
        path: 'ship-spec/sizing.json',
        cause: new Error('EACCES: permission denied, open ship-spec/sizing.json'),
      });
      const error = yield* status('.agents/@montflow/specs', 'ship-spec').pipe(
        Effect.provide(
          stubLayer(
            new Map([['ship-spec', tree('in-progress', '', 'pending', 'pending')]]),
            new Map(),
            { snapshotFailure: failure },
          ),
        ),
        Effect.flip,
      );
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: true,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toContain('code     store.error');
      Vitest.expect(diagnosed.output).toContain('path     ship-spec/sizing.json');
      Vitest.expect(diagnosed.output).toContain(
        'cause    EACCES: permission denied, open ship-spec/sizing.json',
      );
      // Without `--verbose` the same failure prints no cause row.
      const compact = diagnoseCause(Cause.fail(error), {
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      });
      Vitest.expect(compact.output).toContain('code     store.error');
      Vitest.expect(compact.output).not.toContain('cause');
    }),
  );

  Vitest.it.effect('renders an unreadable review store as its own path and repair', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.reviewSeries',
        reason: "Cannot read the review store entry 'reviews/ship-spec/003/REVIEW.md': EACCES",
        path: '/machine/.agents/@montflow/reviews/ship-spec/003/REVIEW.md',
        origin: 'reviews',
        cause: new Error('EACCES: permission denied, open REVIEW.md'),
      });
      const error = yield* status('.agents/@montflow/specs', 'ship-spec').pipe(
        Effect.provide(
          stubLayer(
            new Map([['ship-spec', tree('in-progress', '', 'pending', 'pending')]]),
            new Map(),
            { reviewFailure: failure },
          ),
        ),
        Effect.flip,
      );
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toContain('code     store.error');
      Vitest.expect(diagnosed.output).toContain('path     ship-spec/review-series');
      Vitest.expect(diagnosed.output).toContain('field    review-series');
      Vitest.expect(diagnosed.output).toContain(
        'fix      Check that the review store beside the specs store is readable',
      );
      // Neither the doubled spec/absolute path nor a `--dir` repair appears.
      Vitest.expect(diagnosed.output).not.toContain('/machine/');
      Vitest.expect(diagnosed.output).not.toContain('ship-spec//');
      Vitest.expect(diagnosed.output).not.toContain('field    root');
    }),
  );

  Vitest.it.effect('fails a missing spec with the coded diagnostic', () =>
    Effect.gen(function* () {
      const error = yield* status('.agents/@montflow/specs', 'nope').pipe(
        Effect.provide(
          stubLayer(new Map([['ship-spec', tree('in-progress', '', 'pending', 'pending')]])),
        ),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      Vitest.expect(error.diagnostics[0]?.code).toBe('spec.not-found');
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: 'nope',
        rerun: 'mf-specs status --name nope',
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toContain('code     spec.not-found');
      Vitest.expect(diagnosed.output).toContain('next     mf-specs list');
    }),
  );
});

Vitest.describe('Cli.status lifecycle states runtime', () => {
  const cases = [
    {
      name: 'pending with nothing started',
      label: 'pending',
      specStatus: 'in-progress',
      locked: '',
      a001: 'pending',
      a099: 'pending',
    },
    {
      name: 'pending with work started but no active run',
      label: 'pending',
      specStatus: 'in-progress',
      locked: '',
      a001: 'complete',
      a099: 'pending',
    },
    {
      name: 'blocked',
      label: 'blocked',
      specStatus: 'in-progress',
      locked: '',
      a001: 'blocked',
      a099: 'pending',
    },
    {
      name: 'complete',
      label: 'complete',
      specStatus: 'complete',
      locked: 'A',
      a001: 'complete',
      a099: 'complete',
    },
    {
      name: 'inconsistent',
      label: 'inconsistent',
      specStatus: 'complete',
      locked: 'A',
      a001: 'pending',
      a099: 'complete',
    },
  ] as const;

  for (const testCase of cases) {
    Vitest.it.effect(`reports ${testCase.name}`, () =>
      Effect.gen(function* () {
        const result = yield* runStatus(
          tree(testCase.specStatus, testCase.locked, testCase.a001, testCase.a099),
        );
        Vitest.expect(result.state?.state).toBe(testCase.label);
      }),
    );
  }

  Vitest.it.effect('flags a complete spec with a pending task as inconsistent', () =>
    Effect.gen(function* () {
      const result = yield* runStatus(tree('complete', 'A', 'pending', 'complete'));
      Vitest.expect(result.state?.state).toBe('inconsistent');
      Vitest.expect(result.verify.valid).toBe(false);
      Vitest.expect(result.state?.issues.map((found) => found.field)).toContain('status');
    }),
  );

  Vitest.it.effect('flags all-done-but-in-progress bookkeeping as inconsistent', () =>
    Effect.gen(function* () {
      const result = yield* runStatus(tree('in-progress', 'A', 'complete', 'complete'));
      Vitest.expect(result.state?.state).toBe('inconsistent');
      Vitest.expect(result.state?.issues[0]?.message).toContain('spec status is');
    }),
  );

  Vitest.it.effect('renders the derived state and the contradiction', () =>
    Effect.gen(function* () {
      const result = yield* runStatus(tree('complete', 'A', 'pending', 'complete'));
      const text = renderStatus(result);
      Vitest.expect(text).toContain('state inconsistent');
      Vitest.expect(text).toContain(
        "status: Spec status is 'complete' but 1 task is not complete: A001 (pending).",
      );
      Vitest.expect(text).toContain('Phase A \u00b7 locked');
    }),
  );
});

Vitest.describe('Cli.renderStatus warnings runtime', () => {
  const report: StatusReport = {
    name: 'ship-spec',
    spec: undefined,
    tasks: [],
    state: undefined,
    verify: {
      valid: true,
      issues: [warning('metrics', 'No metrics recorded.', 'Add a `## Metrics` section.')],
    },
    sizing: NO_SIZING,
  };

  Vitest.it('marks a warning and keeps the verified verdict', () => {
    const text = renderStatus(report);
    Vitest.expect(text).toContain('verify \u2713 verified \u00b7 1 warning');
    Vitest.expect(text).toContain('  ! metrics: No metrics recorded.');
    Vitest.expect(text).toContain('    Fix: Add a `## Metrics` section.');
  });
});

/** Sizing knobs for the three-task phase A used by the sizing cases. */
interface SizedTreeOptions {
  readonly repo?: string;
  readonly specSizing?: string;
  readonly a001Size?: string;
  readonly a002Size?: string;
  readonly a099Size?: string;
}

/** Build a phase A with one task per sizing source. */
const sizedTree = (options: SizedTreeOptions = {}): ReadonlyArray<SpecFileEntry> => [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'ship-spec',
      rows: [
        { id: 'A001', name: 'build', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A002', name: 'wire', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ),
  ...(options.specSizing === undefined ? [] : [entry('sizing.json', options.specSizing)]),
  entry(
    'A001-build/TASK.md',
    taskMarkdown({ id: 'A001', name: 'build', size: options.a001Size ?? 'tiny' }),
  ),
  entry('A001-build/MEMORY.md', memory),
  entry(
    'A002-wire/TASK.md',
    taskMarkdown({ id: 'A002', name: 'wire', size: options.a002Size ?? 'small' }),
  ),
  entry('A002-wire/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({
      id: 'A099',
      name: 'review-phase',
      type: 'review',
      size: options.a099Size ?? 'medium',
    }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

/** Run status against a sized tree, with an optional repo-level config. */
const runSized = (options: SizedTreeOptions = {}) =>
  status('.agents/@montflow/specs', 'ship-spec').pipe(
    Effect.provide(
      stubLayer(
        new Map([['ship-spec', sizedTree(options)]]),
        options.repo === undefined ? new Map() : new Map([['sizing.json', options.repo]]),
      ),
    ),
  );

/** The rendered line for one task id. */
const taskLine = (text: string, id: string): string =>
  text.split('\n').find((line) => line.includes(` ${id}  `)) ?? '';

Vitest.describe('Cli.renderStatus sizing runtime', () => {
  Vitest.it.effect('names the config files, the per-phase mapping, and each target', () =>
    Effect.gen(function* () {
      const report = yield* runSized({ repo: REPO_SIZING, specSizing: SPEC_SIZING });
      const text = renderStatus(report);
      Vitest.expect(text).toContain('sizing repo sizing.json · spec ship-spec/sizing.json');
      Vitest.expect(text).toContain('Phase A · budget 2 · sizes tiny,small');
      Vitest.expect(text).toContain(
        '  sizes tiny fixture/phase-model#high · small fixture/spec-model · medium inherit · large inherit',
      );
      Vitest.expect(taskLine(text, 'A001')).toContain(
        'execution  tiny  fixture/phase-model#high  phase',
      );
      Vitest.expect(taskLine(text, 'A002')).toContain('execution  small  fixture/spec-model  spec');
      Vitest.expect(taskLine(text, 'A099')).toContain('review  medium  inherit');
    }),
  );

  Vitest.it.effect('shows a repo-only config with no spec file as source repo', () =>
    Effect.gen(function* () {
      const report = yield* runSized({
        repo: REPO_SIZING,
        a001Size: 'small',
        a002Size: 'small',
        a099Size: 'small',
      });
      const text = renderStatus(report);
      Vitest.expect(text).toContain('sizing repo sizing.json · spec none');
      Vitest.expect(taskLine(text, 'A001')).toContain('small  fixture/repo-model#low  repo');
    }),
  );

  Vitest.it.effect('marks no config files and inherits every target', () =>
    Effect.gen(function* () {
      const text = renderStatus(yield* runSized());
      Vitest.expect(text).toContain('sizing none');
      Vitest.expect(taskLine(text, 'A001')).toContain('tiny  inherit');
      Vitest.expect(text).not.toContain('fixture/');
    }),
  );

  Vitest.it.effect('flags an invalid config and omits misleading targets', () =>
    Effect.gen(function* () {
      const text = renderStatus(
        yield* runSized({ specSizing: '{ "sizes": { "tiny": { "effort": "low" } } }' }),
      );
      Vitest.expect(text).toContain('sizing \u2717 2 issues');
      Vitest.expect(taskLine(text, 'A001')).not.toContain('inherit');
      Vitest.expect(text).not.toContain('fixture/');
    }),
  );

  Vitest.it.effect('omits targets when a tree-only error blocks dispatch', () =>
    Effect.gen(function* () {
      const files = [...sizedTree({ repo: REPO_SIZING }), entry('notes.txt', 'stray\n')];
      const report = yield* status('.agents/@montflow/specs', 'ship-spec').pipe(
        Effect.provide(
          stubLayer(new Map([['ship-spec', files]]), new Map([['sizing.json', REPO_SIZING]])),
        ),
      );
      const text = renderStatus(report);
      Vitest.expect(dispatchExitCode(report.sizing, report.verify, report.name)).toBe(
        VALIDATION_EXIT_CODE,
      );
      Vitest.expect(taskLine(text, 'A001')).not.toContain('fixture/');
      Vitest.expect(taskLine(text, 'A001')).not.toContain('inherit');
      Vitest.expect(text).not.toContain('  sizes ');
    }),
  );

  Vitest.it.effect('gives a tiny-only phase a budget of 1', () =>
    Effect.gen(function* () {
      const text = renderStatus(yield* runSized({ a001Size: 'tiny', a002Size: 'tiny' }));
      Vitest.expect(text).toContain('Phase A · budget 1 · sizes tiny');
    }),
  );
});
