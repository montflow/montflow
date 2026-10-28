import * as Vitest from '@effect/vitest';
import { Cause, Data, Effect } from 'effect';
import * as Sizing from '../../../modules/sizing/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import {
  INTERNAL_EXIT_CODE,
  INTERRUPT_EXIT_CODE,
  SurfaceError,
  VALIDATION_EXIT_CODE,
  check,
  checkExitCode,
  diagnoseCause,
  dispatchExitCode,
  next,
  renderCheck,
  renderNext,
  renderSizing,
  renderSizingReport,
  sizingOf,
  status,
} from '../index.js';
import { REPO_SIZING, SPEC_SIZING, entry, memory, stubLayer } from './helpers.js';

/** An expected failure no surface has an arm for. */
class OtherError extends Data.TaggedError('@test/OtherError')<{
  readonly message: string;
}> {}

const root = '.agents/@montflow/specs';
const specName = 'ship-spec';

/** Sizing and content knobs for the three-task phase A. */
interface TreeOptions {
  readonly repo?: string;
  readonly specSizing?: string;
  readonly a001Size?: string;
  readonly a001Status?: string;
  readonly a002Size?: string;
  readonly a099Size?: string;
  /** Omit the `size` field on both execution tasks. */
  readonly withoutSize?: boolean;
  /** Omit the `size` field on A001 only. */
  readonly a001WithoutSize?: boolean;
}

/** Build a phase A with one task per sizing source. */
const tree = (options: TreeOptions = {}): ReadonlyArray<SpecFileEntry> => {
  const a001Status = options.a001Status ?? 'pending';
  return [
    entry(
      'SPEC.md',
      specMarkdown({
        name: specName,
        rows: [
          {
            id: 'A001',
            name: 'build',
            type: 'execution',
            status: a001Status,
            gates: 'No',
          },
          { id: 'A002', name: 'wire', type: 'execution', status: 'pending', gates: 'No' },
          { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
        ],
      }),
    ),
    ...(options.specSizing === undefined ? [] : [entry('sizing.json', options.specSizing)]),
    entry(
      'A001-build/TASK.md',
      taskMarkdown({
        id: 'A001',
        name: 'build',
        size: options.a001Size ?? 'tiny',
        status: a001Status,
        withoutSize: options.withoutSize === true || options.a001WithoutSize === true,
      }),
    ),
    entry('A001-build/MEMORY.md', memory),
    entry(
      'A002-wire/TASK.md',
      taskMarkdown({
        id: 'A002',
        name: 'wire',
        size: options.a002Size ?? 'small',
        withoutSize: options.withoutSize === true,
      }),
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
};

/** In-memory specs plus the optional repo config. */
const layer = (options: TreeOptions) =>
  stubLayer(
    new Map([[specName, tree(options)]]),
    options.repo === undefined ? new Map() : new Map([['sizing.json', options.repo]]),
  );

const runSizing = (options: TreeOptions = {}, taskId = 'A001') =>
  sizingOf(root, specName, taskId).pipe(Effect.provide(layer(options)));

const runCheck = (options: TreeOptions = {}) =>
  check(root, { name: specName }).pipe(Effect.provide(layer(options)));

/** Pairs of label and value from a rendered diagnostic. */
const diagnosticFields = (text: string): ReadonlyArray<ReadonlyArray<string>> =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = /^\s*(\S+)\s+(.*)$/.exec(line);
      return [match?.[1] ?? '', match?.[2] ?? ''];
    });

Vitest.describe('Cli.sizingOf compact runtime', () => {
  Vitest.it.effect('reports the phase override as the winning layer', () =>
    Effect.gen(function* () {
      const report = yield* runSizing({ repo: REPO_SIZING, specSizing: SPEC_SIZING });
      Vitest.expect(renderSizing(report)).toBe('A001  tiny  fixture/phase-model#high  phase');
    }),
  );

  Vitest.it.effect('reports inherit when no layer defines the size', () =>
    Effect.gen(function* () {
      const report = yield* runSizing();
      Vitest.expect(renderSizing(report)).toBe('A001  tiny  inherit');
    }),
  );

  Vitest.it.effect('reports the task budget and its contribution to the phase', () =>
    Effect.gen(function* () {
      const report = yield* runSizing({ repo: REPO_SIZING, specSizing: SPEC_SIZING });
      Vitest.expect(report.budget).toBe(1);
      Vitest.expect(report.phaseBudget).toBe(2);
      const review = yield* runSizing({ repo: REPO_SIZING, specSizing: SPEC_SIZING }, 'A099');
      Vitest.expect(review.budget).toBe(3);
      Vitest.expect(review.phaseBudget).toBe(2);
      Vitest.expect(renderSizingReport(review)).toContain('contributes 0');
    }),
  );
});

Vitest.describe('Cli.renderSizingReport runtime', () => {
  Vitest.it.effect('prints the declared size, target, layer, and the provenance matrix', () =>
    Effect.gen(function* () {
      const report = yield* runSizing({ repo: REPO_SIZING, specSizing: SPEC_SIZING });
      const lines = renderSizingReport(report).split('\n');
      Vitest.expect(lines[0]).toBe(
        'A001 · declared tiny · target fixture/phase-model#high · source phase',
      );
      Vitest.expect(lines[1]).toBe('budget 1 · contributes 1 · phase A budget 2');
      Vitest.expect((lines[3] ?? '').split(/\s{2,}/)).toStrictEqual([
        'size',
        'repo',
        'spec',
        'phase',
        'winner',
      ]);
      const row = (size: string) => lines.find((line) => line.startsWith(`${size} `)) ?? '';
      Vitest.expect(row('tiny')).toContain('fixture/phase-model#high');
      Vitest.expect(row('tiny')).toMatch(/phase$/);
      Vitest.expect(row('small')).toContain('fixture/spec-model');
      Vitest.expect(row('small')).toMatch(/spec$/);
      Vitest.expect(row('medium')).toMatch(/inherit$/);
      Vitest.expect(row('large')).toMatch(/inherit$/);
    }),
  );

  Vitest.it.effect('marks an absent layer instead of omitting it', () =>
    Effect.gen(function* () {
      const report = yield* runSizing({ repo: REPO_SIZING });
      const lines = renderSizingReport(report).split('\n');
      const row = (size: string) => lines.find((line) => line.startsWith(`${size} `)) ?? '';
      Vitest.expect(row('tiny')).toContain('fixture/repo-model#low');
      Vitest.expect(row('tiny')).toContain('absent');
      Vitest.expect(row('large')).toMatch(/inherit$/);
    }),
  );
});

Vitest.describe('Cli.diagnoseCause runtime', () => {
  Vitest.it.effect('renders an unknown task as an actionable diagnostic', () =>
    Effect.gen(function* () {
      const error = yield* sizingOf(root, specName, 'Z999').pipe(
        Effect.provide(layer({})),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: specName,
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toBe(
        [
          'code     task.not-found',
          'path     ship-spec/Z999',
          'field    id',
          "problem  Task 'Z999' not found in spec 'ship-spec'.",
          'fix      Pass a task id listed under Phase in `mf-specs status --name ship-spec`.',
          'next     mf-specs status --name ship-spec',
        ].join('\n'),
      );
    }),
  );

  Vitest.it.effect('renders an unknown spec as an actionable diagnostic', () =>
    Effect.gen(function* () {
      const error = yield* sizingOf(root, 'nope', 'A001').pipe(
        Effect.provide(layer({})),
        Effect.flip,
      );
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: 'nope',
        rerun: 'mf-specs check --name nope',
        verbose: false,
      });
      Vitest.expect(diagnosed.output).toContain('code     spec.not-found');
      Vitest.expect(diagnosed.output).toContain('next     mf-specs list');
    }),
  );

  Vitest.it.effect('renders an invalid config with code, fix, and preserved cause', () =>
    Effect.gen(function* () {
      const error = yield* runSizing({
        specSizing: '{ "sizes": { "tiny": { "model": "no-slash", "effort": "low" } } }',
      }).pipe(Effect.flip);
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: specName,
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      const fields = diagnosticFields(diagnosed.output);
      Vitest.expect(fields.map(([label]) => label)).toStrictEqual([
        'code',
        'path',
        'field',
        'problem',
        'expected',
        'actual',
        'fix',
        'next',
      ]);
      Vitest.expect(fields[0]?.[1]).toBe('sizing.malformed-model');
      Vitest.expect(fields[1]?.[1]).toBe('ship-spec/sizing.json');
      Vitest.expect(fields[2]?.[1]).toBe('sizes.tiny.model');
      Vitest.expect(fields[6]?.[1]).toBe('Set sizes.tiny.model to a "provider/model" id.');
      Vitest.expect(fields[7]?.[1]).toBe('mf-specs check --name ship-spec');

      const caused = diagnoseCause(
        Cause.fail(
          new Sizing.SizingError({
            operation: 'Sizing.parse',
            path: 'sizing.json',
            field: 'root',
            code: 'sizing.malformed-json',
            message: 'Config is not valid JSON.',
            expected: 'a JSON object with a "sizes" map',
            actual: 'unparseable JSON',
            fix: 'Rewrite sizing.json as valid JSON.',
            cause: new Error('Unexpected token'),
          }),
        ),
        { path: specName, rerun: 'mf-specs check', verbose: false },
      );
      Vitest.expect(caused.output).toContain('cause    Unexpected token');
    }),
  );

  Vitest.it('labels an unexpected defect internal and hides the stack by default', () => {
    const defect = new Error('boom');
    const diagnosed = diagnoseCause(Cause.die(defect), {
      path: specName,
      rerun: 'mf-specs sizing --name ship-spec --task A001',
      verbose: false,
    });
    Vitest.expect(diagnosed.exitCode).toBe(INTERNAL_EXIT_CODE);
    Vitest.expect(diagnosed.output).toContain('code     internal');
    Vitest.expect(diagnosed.output).toContain('problem  Internal defect: boom');
    Vitest.expect(diagnosed.output.split('\n').some((line) => line.startsWith('stack'))).toBe(
      false,
    );
    Vitest.expect(diagnosed.output).not.toContain('    at ');

    const verbose = diagnoseCause(Cause.die(defect), {
      path: specName,
      rerun: 'mf-specs sizing --name ship-spec --task A001',
      verbose: true,
    });
    Vitest.expect(verbose.output).toContain('stack    Error: boom');
  });

  Vitest.it('renders an unhandled expected failure as validation, not an internal defect', () => {
    const diagnosed = diagnoseCause(Cause.fail(new OtherError({ message: 'nope' })), {
      path: specName,
      rerun: 'mf-specs check --name ship-spec',
      verbose: false,
    });
    Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
    Vitest.expect(diagnosed.output).toContain('code     failure.unhandled');
    Vitest.expect(diagnosed.output).toContain('problem  Unhandled failure: nope');
    Vitest.expect(diagnosed.output).not.toContain('Internal defect');
  });

  Vitest.it('treats a pure interruption as an interruption, not a defect', () => {
    const diagnosed = diagnoseCause(Cause.interrupt(1), {
      path: specName,
      rerun: 'mf-specs check --name ship-spec',
      verbose: false,
    });
    Vitest.expect(diagnosed.exitCode).toBe(INTERRUPT_EXIT_CODE);
    Vitest.expect(diagnosed.output).toBe('');
  });
});

Vitest.describe('Cli.check sizing aggregation runtime', () => {
  Vitest.it.effect(
    'reports the repo config, the spec config, and every missing size in one run',
    () =>
      Effect.gen(function* () {
        const report = yield* runCheck({
          repo: '{ "sizes": { "tiny": { "effort": "low" } } }',
          specSizing: '{ "sizes": {}, "extra": true }',
          withoutSize: true,
        });
        Vitest.expect(report.rootIssues.map((found) => found.code)).toStrictEqual([
          'sizing.missing-model',
          'sizing.effort-without-model',
        ]);
        const codes = report.specs[0]?.issues
          .map((found) => found.code)
          .filter((code) => code !== undefined);
        Vitest.expect(codes).toStrictEqual([
          'task.missing-size',
          'task.missing-size',
          'sizing.unknown-key',
        ]);
        Vitest.expect(report.issueCount).toBe(5);
        Vitest.expect(report.failed).toBe(1);
        Vitest.expect(checkExitCode(report)).toBe(VALIDATION_EXIT_CODE);

        const text = renderCheck(report, false);
        Vitest.expect(text).toContain('\u2717 sizing.json (2)');
        Vitest.expect(text).toContain('  code     sizing.missing-model');
        Vitest.expect(text).toContain('  path     sizing.json');
        Vitest.expect(text).toContain('  field    sizes.tiny.model');
        Vitest.expect(text).toContain('  fix      Add "model": "provider/model" to sizes.tiny.');
        Vitest.expect(text).toContain('  path     ship-spec/sizing.json');
        Vitest.expect(text).toContain('  field    extra');
        Vitest.expect(text).toContain('  path     ship-spec/A001-build/TASK.md');
        Vitest.expect(text).toContain('  code     task.missing-size');
        Vitest.expect(text).toContain('5 issues');
      }),
  );

  Vitest.it.effect('flags a spec-config phase with no task as a warning', () =>
    Effect.gen(function* () {
      const report = yield* runCheck({
        specSizing: '{ "sizes": {}, "phases": { "B": { "sizes": {} } } }',
      });
      const found = report.specs[0]?.issues.find(
        (candidate) => candidate.code === 'sizing.unknown-phase',
      );
      Vitest.expect(found?.severity).toBe('warning');
      Vitest.expect(found?.message).toContain("Phase 'B' has no tasks");
      Vitest.expect(report.specs[0]?.valid).toBe(true);
      Vitest.expect(report.warningCount).toBe(1);
      const text = renderCheck(report, false);
      Vitest.expect(text).toContain('\u2713 ship-spec (1 warning)');
      Vitest.expect(text).toContain('  code     ! sizing.unknown-phase');
    }),
  );

  Vitest.it.effect('codes the complete-task missing-size warning and traces its layer', () =>
    Effect.gen(function* () {
      const report = yield* runCheck({ a001Status: 'complete', a001WithoutSize: true });
      const found = report.specs[0]?.issues.find(
        (candidate) =>
          candidate.code === 'task.missing-size' && candidate.field === 'A001-build/TASK.md: size',
      );
      Vitest.expect(found?.severity).toBe('warning');
      Vitest.expect(found?.expected).toBe('tiny, small, medium, large');
      Vitest.expect(found?.actual).toBe('missing');
      Vitest.expect(found?.layers).toStrictEqual({
        consulted: ['repo', 'spec', 'phase'],
        phase: 'A',
      });
      Vitest.expect(renderCheck(report, true)).toContain('  code     ! task.missing-size');
      Vitest.expect(report.specs[0]?.valid).toBe(true);
    }),
  );
});

Vitest.describe('Cli dispatch gating runtime', () => {
  Vitest.it.effect('fails sizingOf for a pending task with no size, like check', () =>
    Effect.gen(function* () {
      const error = yield* runSizing({ withoutSize: true }).pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: specName,
        rerun: `mf-specs check --name ${specName}`,
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toContain('code     task.missing-size');
      Vitest.expect(diagnosed.output).toContain('path     ship-spec/A001-build/TASK.md');
      Vitest.expect(diagnosed.output).toContain('field    size');
      Vitest.expect(diagnosed.output).toContain(
        'fix      Add `size: medium` to TASK.md frontmatter (tiny, small, medium, large).',
      );
    }),
  );

  Vitest.it.effect('fails sizingOf with task.unknown-size instead of task.not-found', () =>
    Effect.gen(function* () {
      const error = yield* runSizing({ a001Size: 'huge' }).pipe(Effect.flip);
      const diagnosed = diagnoseCause(Cause.fail(error), {
        path: specName,
        rerun: `mf-specs check --name ${specName}`,
        verbose: false,
      });
      Vitest.expect(diagnosed.exitCode).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(diagnosed.output).toContain('code     task.unknown-size');
      Vitest.expect(diagnosed.output).not.toContain('task.not-found');
      Vitest.expect(diagnosed.output).toContain('path     ship-spec/A001-build/TASK.md');
      Vitest.expect(diagnosed.output).toContain('actual   huge');
    }),
  );

  Vitest.it.effect('keeps an unknown-size task visible to status', () =>
    Effect.gen(function* () {
      const report = yield* status(root, specName).pipe(
        Effect.provide(layer({ a001Size: 'huge' })),
      );
      Vitest.expect(report.tasks.map((task) => task.id)).toStrictEqual(['A001', 'A002', 'A099']);
      Vitest.expect(dispatchExitCode(report.sizing, report.verify)).toBe(VALIDATION_EXIT_CODE);
    }),
  );

  Vitest.it.effect('makes check, status, and next agree on a tree with no task size', () =>
    Effect.gen(function* () {
      const options: TreeOptions = { withoutSize: true };
      const shared = layer(options);
      const checked = yield* check(root, { name: specName }).pipe(Effect.provide(shared));
      const reported = yield* status(root, specName).pipe(Effect.provide(shared));
      const ready = yield* next(root, specName).pipe(Effect.provide(shared));

      Vitest.expect(checkExitCode(checked)).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(dispatchExitCode(reported.sizing, reported.verify)).toBe(VALIDATION_EXIT_CODE);
      Vitest.expect(dispatchExitCode(ready.sizing, ready.verify)).toBe(VALIDATION_EXIT_CODE);

      const text = renderNext(ready);
      Vitest.expect(text).toContain('A001  execution  build');
      Vitest.expect(text).not.toContain('inherit');
    }),
  );
});
