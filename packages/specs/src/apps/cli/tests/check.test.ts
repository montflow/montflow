import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { issue, warning } from '../../../modules/verify/index.js';
import { type CheckReport, check, checkExitCode, reduceCheck, renderCheck } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const okFiles = [
  entry('SPEC.md', specMarkdown({ name: 'ok' })),
  entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const specs = new Map([
  ['ok', okFiles],
  ['bad', [entry('SPEC.md', specMarkdown({ name: 'bad' }))]],
]);

Vitest.describe('Cli.check runtime', () => {
  Vitest.it.effect('aggregates every spec under the root', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs').pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.specs.map((spec) => spec.name)).toStrictEqual(['bad', 'ok']);
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.specs.find((spec) => spec.name === 'ok')?.valid).toBe(true);
    }),
  );

  Vitest.it.effect('checks a single named spec', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.specs).toHaveLength(1);
      Vitest.expect(report.failed).toBe(0);
    }),
  );

  Vitest.it.effect('reports a missing named spec as a failure', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/specs', { name: 'nope' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.specs[0]?.issues[0]?.field).toBe('nope');
    }),
  );
});

const report: CheckReport = {
  root: '.agents/@montflow/specs',
  specs: [
    { name: 'ok', valid: true, issues: [] },
    {
      name: 'bad',
      valid: false,
      issues: [{ field: 'SPEC.md: tasks', message: 'Task table has no rows.' }],
    },
  ],
  failed: 1,
  issueCount: 1,
  warningCount: 0,
};

Vitest.describe('Cli.renderCheck runtime', () => {
  Vitest.it('hides passing specs by default', () => {
    Vitest.expect(renderCheck(report, false)).toBe(
      '\u2717 bad (1)\n  SPEC.md: tasks: Task table has no rows.\n\n2 specs \u00b7 1 failed \u00b7 1 issue',
    );
  });

  Vitest.it('lists passing specs and the root when verbose', () => {
    Vitest.expect(renderCheck(report, true)).toBe(
      'root .agents/@montflow/specs\n\u2713 ok\n\u2717 bad (1)\n  SPEC.md: tasks: Task table has no rows.\n\n2 specs \u00b7 1 failed \u00b7 1 issue',
    );
  });
});

const warningReport: CheckReport = {
  root: '.agents/@montflow/specs',
  specs: [
    {
      name: 'ok',
      valid: true,
      issues: [
        {
          field: 'metrics',
          message: 'No metrics recorded.',
          severity: 'warning',
          fix: 'Add a `## Metrics` section.',
        },
      ],
    },
  ],
  failed: 0,
  issueCount: 0,
  warningCount: 1,
};

Vitest.describe('Cli.renderCheck warnings runtime', () => {
  Vitest.it('renders warnings with a mark, apart from issues', () => {
    Vitest.expect(renderCheck(warningReport, false)).toBe(
      '\u2713 ok (1 warning)\n  ! metrics: No metrics recorded.\n    Fix: Add a `## Metrics` section.\n\n1 spec \u00b7 0 failed \u00b7 0 issues \u00b7 1 warning',
    );
  });

  Vitest.it('shows a warning-only spec without --verbose', () => {
    Vitest.expect(renderCheck(warningReport, false)).toContain('\u2713 ok (1 warning)');
  });
});

Vitest.describe('Cli.reduceCheck severity runtime', () => {
  const root = '.agents/@montflow/specs';

  Vitest.it('defaults an issue to error and fails the check', () => {
    const reduced = reduceCheck(root, [{ name: 'bad', issues: [issue('id', 'Missing.')] }], false);
    Vitest.expect(reduced.failed).toBe(1);
    Vitest.expect(reduced.issueCount).toBe(1);
    Vitest.expect(reduced.warningCount).toBe(0);
    Vitest.expect(reduced.specs[0]?.valid).toBe(false);
    Vitest.expect(checkExitCode(reduced)).toBe(1);
  });

  Vitest.it('does not fail on warnings alone', () => {
    const reduced = reduceCheck(
      root,
      [{ name: 'ok', issues: [warning('metrics', 'No metrics recorded.')] }],
      false,
    );
    Vitest.expect(reduced.failed).toBe(0);
    Vitest.expect(reduced.issueCount).toBe(0);
    Vitest.expect(reduced.warningCount).toBe(1);
    Vitest.expect(reduced.specs[0]?.valid).toBe(true);
    Vitest.expect(checkExitCode(reduced)).toBe(0);
  });

  Vitest.it('promotes warnings to errors under strict', () => {
    const reduced = reduceCheck(
      root,
      [{ name: 'ok', issues: [warning('metrics', 'No metrics recorded.')] }],
      true,
    );
    Vitest.expect(reduced.failed).toBe(1);
    Vitest.expect(reduced.issueCount).toBe(1);
    Vitest.expect(reduced.warningCount).toBe(0);
    Vitest.expect(reduced.specs[0]?.valid).toBe(false);
    Vitest.expect(checkExitCode(reduced)).toBe(1);
  });
});
