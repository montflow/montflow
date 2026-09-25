import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { featureMarkdown } from '../../../modules/feature/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { runSlash } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const features = new Map([
  [
    'ok',
    [
      entry('FEATURE.md', featureMarkdown({ name: 'ok' })),
      entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ],
  ],
  ['bad', [entry('FEATURE.md', featureMarkdown({ name: 'bad' }))]],
]);

const root = '.agents/@montflow/features';

Vitest.describe('Cli.runSlash runtime', () => {
  Vitest.it.effect('runs check for one feature', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok', root).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('1 feature');
    }),
  );

  Vitest.it.effect('lists passing features with --verbose', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --verbose', root).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2713 ok');
    }),
  );

  Vitest.it.effect('runs status --name', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name ok', root).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Phase A');
    }),
  );

  Vitest.it.effect('reports a failing status as not ok', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name bad', root).pipe(
        Effect.provide(stubLayer(features)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2717');
    }),
  );

  Vitest.it.effect('rejects status without --name', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('status', root).pipe(
        Effect.provide(stubLayer(features)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('status requires --name');
    }),
  );
});
