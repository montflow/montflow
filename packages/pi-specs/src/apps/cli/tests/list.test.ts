import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import { LIST_STATUSES, list, renderList, resolveListOptions } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';

/** One spec tree whose derived state follows from the task statuses. */
const specTree = (
  name: string,
  taskStatus: string,
  specStatus = 'in-progress',
  lockedPhases = '',
) => [
  entry(
    'SPEC.md',
    specMarkdown({
      name,
      status: specStatus,
      lockedPhases,
      rows: [
        { id: 'A001', name: 'do-thing', type: 'execution', status: taskStatus, gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: taskStatus, gates: 'No' },
      ],
    }),
  ),
  entry(
    'A001-do-thing/TASK.md',
    taskMarkdown({ id: 'A001', name: 'do-thing', status: taskStatus }),
  ),
  entry('A001-do-thing/MEMORY.md', memory),
  entry(
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: taskStatus }),
  ),
  entry('A099-review-phase/MEMORY.md', memory),
];

const specs = new Map([
  ['alpha', specTree('alpha', 'pending')],
  ['beta', specTree('beta', 'blocked')],
  ['delta', specTree('delta', 'pending', 'complete', 'A')],
  ['gamma', specTree('gamma', 'complete', 'complete', 'A')],
]);

const runList = (options = {}) => list(root, options).pipe(Effect.provide(stubLayer(specs)));

Vitest.describe('Cli.list runtime', () => {
  Vitest.it.effect('lists every spec with its derived state', () =>
    Effect.gen(function* () {
      const report = yield* runList();
      Vitest.expect(report.total).toBe(4);
      Vitest.expect(report.matched).toBe(4);
      Vitest.expect(report.specs.map((spec) => [spec.name, spec.state?.state])).toStrictEqual([
        ['alpha', 'pending'],
        ['beta', 'blocked'],
        ['delta', 'inconsistent'],
        ['gamma', 'complete'],
      ]);
    }),
  );

  Vitest.it.effect('--pending keeps every unfinished spec', () =>
    Effect.gen(function* () {
      const report = yield* runList({ pending: true });
      Vitest.expect(report.specs.map((spec) => spec.name)).toStrictEqual([
        'alpha',
        'beta',
        'delta',
      ]);
      Vitest.expect(report.matched).toBe(3);
    }),
  );

  Vitest.it.effect('--status keeps exact states', () =>
    Effect.gen(function* () {
      const report = yield* runList({ statuses: ['complete'] });
      Vitest.expect(report.specs.map((spec) => spec.name)).toStrictEqual(['gamma']);
      Vitest.expect(report.total).toBe(4);
    }),
  );

  Vitest.it.effect('--status matches several states', () =>
    Effect.gen(function* () {
      const report = yield* runList({ statuses: ['complete', 'pending'] });
      Vitest.expect(report.specs.map((spec) => spec.name)).toStrictEqual(['alpha', 'gamma']);
    }),
  );

  Vitest.it.effect('fails for a missing root', () =>
    Effect.gen(function* () {
      const error = yield* list(root).pipe(
        Effect.provide(
          Layer.succeed(
            SpecStore.SpecStore,
            SpecStore.SpecStore.of({
              names: () => Effect.succeed([]),
              hasRoot: () => Effect.succeed(false),
              exists: () => Effect.succeed(false),
              snapshot: () =>
                Effect.fail(new SpecStore.StoreError({ operation: 'unused', reason: 'unused' })),
            }),
          ),
        ),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain('Specs directory not found');
    }),
  );
});

Vitest.describe('Cli.renderList runtime', () => {
  Vitest.it.effect('shows one line per spec and a matched summary', () =>
    Effect.gen(function* () {
      const report = yield* runList({ pending: true });
      const text = renderList(report, false);
      Vitest.expect(text).toContain('\u25cb alpha  in-progress \u00b7 pending');
      Vitest.expect(text).toContain('\u2717 beta  in-progress \u00b7 blocked');
      Vitest.expect(text).toContain('4 specs \u00b7 3 matched');
      Vitest.expect(text).not.toContain('gamma');
    }),
  );

  Vitest.it.effect('verbose prepends the root', () =>
    Effect.gen(function* () {
      const report = yield* runList({ statuses: ['complete'] });
      Vitest.expect(renderList(report, true).startsWith(`root ${root}`)).toBe(true);
    }),
  );
});

Vitest.describe('Cli.resolveListOptions runtime', () => {
  Vitest.it('defaults to no filter', () => {
    Vitest.expect(resolveListOptions(undefined, false)).toStrictEqual({ options: {} });
  });

  Vitest.it('maps --pending to the unfinished shorthand', () => {
    Vitest.expect(resolveListOptions(undefined, true)).toStrictEqual({
      options: { pending: true },
    });
  });

  Vitest.it('parses a comma-separated status list', () => {
    Vitest.expect(resolveListOptions('pending, in-progress', false)).toStrictEqual({
      options: { statuses: ['pending', 'in-progress'] },
    });
  });

  Vitest.it('accepts `completed` as an alias for `complete`', () => {
    Vitest.expect(resolveListOptions('completed', false)).toStrictEqual({
      options: { statuses: ['complete'] },
    });
  });

  Vitest.it('rejects an unknown status', () => {
    const result = resolveListOptions('bogus', false);
    Vitest.expect('error' in result && result.error).toContain("Unknown status 'bogus'");
    Vitest.expect(LIST_STATUSES).toContain('inconsistent');
  });

  Vitest.it('rejects --pending combined with --status', () => {
    const result = resolveListOptions('pending', true);
    Vitest.expect('error' in result && result.error).toContain('not both');
  });
});
