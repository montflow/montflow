import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { featureMarkdown } from '../../../modules/feature/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { type CheckReport, check, renderCheck } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const okFiles = [
  entry('FEATURE.md', featureMarkdown({ name: 'ok' })),
  entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
  entry('A001-implement-login/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const features = new Map([
  ['ok', okFiles],
  ['bad', [entry('FEATURE.md', featureMarkdown({ name: 'bad' }))]],
]);

Vitest.describe('Cli.check runtime', () => {
  Vitest.it.effect('aggregates every feature under the root', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/features').pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.features.map((feature) => feature.name)).toStrictEqual(['bad', 'ok']);
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.features.find((feature) => feature.name === 'ok')?.valid).toBe(true);
    }),
  );

  Vitest.it.effect('checks a single named feature', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/features', { name: 'ok' }).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.features).toHaveLength(1);
      Vitest.expect(report.failed).toBe(0);
    }),
  );

  Vitest.it.effect('reports a missing named feature as a failure', () =>
    Effect.gen(function* () {
      const report = yield* check('.agents/@montflow/features', { name: 'nope' }).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.features[0]?.issues[0]?.field).toBe('nope');
    }),
  );
});

const report: CheckReport = {
  root: '.agents/@montflow/features',
  features: [
    { name: 'ok', valid: true, issues: [] },
    {
      name: 'bad',
      valid: false,
      issues: [{ field: 'FEATURE.md: tasks', message: 'Task table has no rows.' }],
    },
  ],
  failed: 1,
  issueCount: 1,
};

Vitest.describe('Cli.renderCheck runtime', () => {
  Vitest.it('hides passing features by default', () => {
    Vitest.expect(renderCheck(report, false)).toBe(
      '\u2717 bad (1)\n  FEATURE.md: tasks: Task table has no rows.\n\n2 features \u00b7 1 failed \u00b7 1 issue',
    );
  });

  Vitest.it('lists passing features and the root when verbose', () => {
    Vitest.expect(renderCheck(report, true)).toBe(
      'root .agents/@montflow/features\n\u2713 ok\n\u2717 bad (1)\n  FEATURE.md: tasks: Task table has no rows.\n\n2 features \u00b7 1 failed \u00b7 1 issue',
    );
  });
});
