import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';

import type { SeriesSnapshot } from '../../../modules/review-link/index.js';
import {
  mechanicalPhaseGate,
  passingResult,
  phaseMarkdown,
} from '../../../modules/phase/tests/helpers.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { type CheckReport, check } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

/** The completed review task's TASK.md, with optional declared profiles. */
const reviewTask = (profiles?: string): string =>
  profiles === undefined
    ? taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' })
    : taskMarkdown({
        id: 'A099',
        name: 'review-phase',
        type: 'review',
        status: 'complete',
        reviewerProfiles: profiles,
      });

/** A v2 spec whose one work task and review task are complete. */
const tree = (profiles?: string) => [
  entry(
    'SPEC.md',
    specMarkdown({
      name: 'reviewed',
      version: '2',
      status: 'complete',
      rows: [
        { id: 'A001', name: 'implement', type: 'execution', status: 'complete', gates: 'Yes' },
        { id: 'A099', name: 'review-phase', type: 'review', status: 'complete', gates: 'No' },
      ],
    }).replace(
      '## Tasks',
      '## Creation\n\n- tier: standard\n- questions 0/2\n- unresolved: none\n\n## Tasks',
    ),
  ),
  entry('A/PHASE.md', phaseMarkdown({ id: 'A', status: 'complete', review: 'required' })),
  entry('A/MEMORY.md', memory),
  entry(
    'A/A001-implement/TASK.md',
    taskMarkdown({ id: 'A001', name: 'implement', status: 'complete' }),
  ),
  entry('A/A001-implement/MEMORY.md', memory),
  entry('A/A001-implement/GATES.md', mechanicalPhaseGate(0)),
  entry('A/A001-implement/GATE-RESULTS.jsonl', passingResult(0)),
  entry('A/A099-review-phase/TASK.md', reviewTask(profiles)),
  entry('A/A099-review-phase/MEMORY.md', memory),
];

const cleanRound = (name: string): SeriesSnapshot => ({
  name,
  rounds: [{ round: '001', phase: 'A', passed: true, findings: [] }],
});

const codesOf = (report: CheckReport) =>
  report.specs.flatMap((spec) => spec.issues.map((issue) => issue.code));

Vitest.describe('Cli.check review gate', () => {
  Vitest.it.effect('fails a v2 complete review task with no review series (closure)', () =>
    Effect.gen(function* () {
      const specs = new Map([['reviewed', tree()]]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(report.specs[0]?.issues.some((issue) => issue.field === 'review-series')).toBe(
        true,
      );
    }),
  );

  Vitest.it.effect('passes a v2 complete review task with a clean closed round', () =>
    Effect.gen(function* () {
      const specs = new Map([['reviewed', tree()]]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(stubLayer(specs, new Map(), { reviews: [cleanRound('reviewed')] })),
      );
      Vitest.expect(report.failed).toBe(0);
    }),
  );

  Vitest.it.effect('fails when a declared profile series still holds an open Major (multi)', () =>
    Effect.gen(function* () {
      const specs = new Map([['reviewed', tree('security')]]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(
          stubLayer(specs, new Map(), {
            reviews: [
              cleanRound('reviewed'),
              {
                name: 'reviewed-security',
                rounds: [
                  {
                    round: '001',
                    phase: 'A',
                    passed: true,
                    findings: [{ id: 'F1', severity: 'Major', status: 'Open' }],
                  },
                ],
              },
            ],
          }),
        ),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(codesOf(report)).toContain('review.not-passed');
    }),
  );

  Vitest.it.effect('fails a closed round that still holds an open Critical (closedbad)', () =>
    Effect.gen(function* () {
      const specs = new Map([['reviewed', tree()]]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(
          stubLayer(specs, new Map(), {
            reviews: [
              {
                name: 'reviewed',
                rounds: [
                  {
                    round: '001',
                    phase: 'A',
                    passed: true,
                    findings: [{ id: 'F1', severity: 'Critical', status: 'Open' }],
                  },
                ],
              },
            ],
          }),
        ),
      );
      Vitest.expect(report.failed).toBe(1);
      Vitest.expect(codesOf(report)).toContain('review.not-passed');
    }),
  );

  Vitest.it.effect(
    'fails a minor-deferred round whose deferred Minor is still open (deferred)',
    () =>
      Effect.gen(function* () {
        const specs = new Map([['reviewed', tree()]]);
        const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
          Effect.provide(
            stubLayer(specs, new Map(), {
              reviews: [
                {
                  name: 'reviewed',
                  rounds: [
                    {
                      round: '001',
                      phase: 'A',
                      passed: true,
                      findings: [{ id: 'F1', severity: 'Minor', status: 'Open' }],
                      deferral: {
                        disposition: 'minor-deferred',
                        deferred: ['F1'],
                        missing: [],
                        severities: ['Minor'],
                        invalidIds: [],
                        severityInvalid: false,
                        valid: true,
                      },
                    },
                  ],
                },
              ],
            }),
          ),
        );
        Vitest.expect(report.failed).toBe(1);
        Vitest.expect(codesOf(report)).toContain('review.not-passed');
      }),
  );
});
