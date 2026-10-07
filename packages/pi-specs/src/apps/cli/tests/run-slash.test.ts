import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { runSlash } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const specs = new Map([
  [
    'ok',
    [
      entry('SPEC.md', specMarkdown({ name: 'ok' })),
      entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ],
  ],
  ['bad', [entry('SPEC.md', specMarkdown({ name: 'bad' }))]],
]);

const root = '.agents/@montflow/specs';

Vitest.describe('Cli.runSlash runtime', () => {
  Vitest.it.effect('runs check for one spec', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('1 spec');
    }),
  );

  Vitest.it.effect('lists passing specs with --verbose', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --verbose', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2713 ok');
    }),
  );

  Vitest.it.effect('runs status --name', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Phase A');
    }),
  );

  Vitest.it.effect('reports a failing status as not ok', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name bad', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2717');
    }),
  );

  Vitest.it.effect('rejects status without --name', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('status', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('status requires --name');
    }),
  );

  Vitest.it.effect('runs list --pending', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('list --pending', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('2 specs');
    }),
  );

  Vitest.it.effect('reports an unknown list status as an error', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('list --status=bogus', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain("Unknown status 'bogus'");
    }),
  );
});
