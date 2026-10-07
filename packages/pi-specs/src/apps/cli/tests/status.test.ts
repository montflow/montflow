import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { renderStatus, status } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

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

  Vitest.it.effect('fails for a missing spec', () =>
    Effect.gen(function* () {
      const error = yield* status('.agents/@montflow/specs', 'nope').pipe(
        Effect.provide(
          stubLayer(new Map([['ship-spec', tree('in-progress', '', 'pending', 'pending')]])),
        ),
        Effect.flip,
      );
      Vitest.expect(error.reason).toContain("Spec 'nope' not found");
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
