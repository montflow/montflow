import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';

import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { next } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const root = '.agents/@montflow/specs';

const tree = [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'ship-login',
      version: '2',
      rows: [
        { id: 'A002', name: 'second', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A010', name: 'tenth', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'A001', name: 'first', type: 'execution', status: 'pending', gates: 'No' },
      ],
    }),
  ),
  entry(
    'A/PHASE.md',
    '---\nid: A\nobjective: Build it.\nstatus: pending\nreview: required\ngate: none\n---\n\n# Phase A\n',
  ),
  entry('A/MEMORY.md', memory),
  entry('A/A001-first/TASK.md', taskMarkdown({ id: 'A001', name: 'first' })),
  entry('A/A001-first/MEMORY.md', memory),
  entry('A/A002-second/TASK.md', taskMarkdown({ id: 'A002', name: 'second', dependsOn: 'A001' })),
  entry('A/A002-second/MEMORY.md', memory),
  entry('A/A010-tenth/TASK.md', taskMarkdown({ id: 'A010', name: 'tenth' })),
  entry('A/A010-tenth/MEMORY.md', memory),
];

Vitest.describe('Cli.next numbering runtime', () => {
  Vitest.it.effect('orders the ready set by arithmetic sort key, not string order', () =>
    Effect.gen(function* () {
      const report = yield* next(root, 'ship-login').pipe(
        Effect.provide(stubLayer(new Map([['ship-login', tree]]))),
      );
      Vitest.expect(report.ready.map((task) => task.id)).toStrictEqual(['A001', 'A010']);
    }),
  );

  Vitest.it.effect('excludes a task whose dependency is not complete', () =>
    Effect.gen(function* () {
      const report = yield* next(root, 'ship-login').pipe(
        Effect.provide(stubLayer(new Map([['ship-login', tree]]))),
      );
      Vitest.expect(report.ready.map((task) => task.id)).not.toContain('A002');
    }),
  );
});
