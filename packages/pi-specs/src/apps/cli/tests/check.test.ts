import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { type CheckReport, check, renderCheck } from '../index.js';
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
