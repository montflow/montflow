import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { CliError } from 'effect/cli';
import { TestConsole } from 'effect/testing';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { finding, issue, warning } from '../../../modules/verify/index.js';
import { SpecStore } from '../../../services/index.js';
import {
  type CheckReport,
  INTERNAL_EXIT_CODE,
  check,
  checkExitCode,
  dispatchErrorText,
  dispatchExitCode,
  next,
  reduceCheck,
  renderCheck,
  renderNext,
  runDiagnosed,
  status,
} from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

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

/** `count` round snapshots attributed to phase A, numbered from 001. */
const rounds = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    round: String(index + 1).padStart(3, '0'),
    phase: 'A',
  }));

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

  Vitest.it.effect('passes a no-profile spec with a completed review and no series (F17)', () =>
    Effect.gen(function* () {
      const tree = new Map([
        [
          'reviewed',
          [
            entry(
              'SPEC.md',
              specMarkdown({
                name: 'reviewed',
                rows: [
                  {
                    id: 'A001',
                    name: 'implement-login',
                    type: 'execution',
                    status: 'complete',
                    gates: 'No',
                  },
                  {
                    id: 'A099',
                    name: 'review-phase',
                    type: 'review',
                    status: 'complete',
                    gates: 'No',
                  },
                ],
              }),
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login', status: 'complete' }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
              }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const report = yield* check('.agents/@montflow/specs', { name: 'reviewed' }).pipe(
        Effect.provide(stubLayer(tree)),
      );
      Vitest.expect(report.specs[0]?.valid).toBe(true);
      Vitest.expect(report.failed).toBe(0);
    }),
  );

  Vitest.it.effect('warns for unchecked completion and an all-unchecked gate, in one group', () =>
    Effect.gen(function* () {
      const tree = new Map([
        [
          'records',
          [
            entry(
              'SPEC.md',
              specMarkdown({
                name: 'records',
                status: 'complete',
                lockedPhases: 'A',
                rows: [
                  {
                    id: 'A001',
                    name: 'implement-login',
                    type: 'execution',
                    status: 'complete',
                    gates: 'Yes',
                  },
                  {
                    id: 'A099',
                    name: 'review-phase',
                    type: 'review',
                    status: 'complete',
                    gates: 'No',
                  },
                ],
              }),
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({
                id: 'A001',
                name: 'implement-login',
                status: 'complete',
                completion: ['- [x] Built', '- [ ] Verified'].join('\n'),
              }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A001-implement-login/GATES.md',
              ['## Stage 0', '', '- [ ] `bun run --cwd packages/apps test`', ''].join('\n'),
            ),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
              }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const report = yield* check('.agents/@montflow/specs', { name: 'records' }).pipe(
        Effect.provide(stubLayer(tree)),
      );
      Vitest.expect(report.failed).toBe(0);
      Vitest.expect(report.warningCount).toBe(2);
      Vitest.expect(report.specs[0]?.issues.map((found) => found.code)).toStrictEqual([
        'task.completion-unchecked',
        'gate.unchecked',
      ]);
      const output = renderCheck(report, false);
      Vitest.expect(output).toContain('task.completion-unchecked \u00d7 1');
      Vitest.expect(output).toContain('gate.unchecked \u00d7 1');
      // Both record codes share the spec's single warning line.
      Vitest.expect(output.split('\n').filter((line) => line.startsWith('  ! '))).toHaveLength(1);
    }),
  );

  Vitest.it.effect('leaves an untouched historical record free of record warnings', () =>
    Effect.gen(function* () {
      const tree = new Map([
        [
          'history',
          [
            entry(
              'SPEC.md',
              specMarkdown({
                name: 'history',
                status: 'complete',
                lockedPhases: 'A',
                rows: [
                  {
                    id: 'A001',
                    name: 'implement-login',
                    type: 'execution',
                    status: 'complete',
                    gates: 'Yes',
                  },
                  {
                    id: 'A099',
                    name: 'review-phase',
                    type: 'review',
                    status: 'complete',
                    gates: 'No',
                  },
                ],
              }),
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login', status: 'complete' }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A001-implement-login/GATES.md',
              ['## Stage 0', '', '- [x] `bun run --cwd packages/apps test`', ''].join('\n'),
            ),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
              }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const report = yield* check('.agents/@montflow/specs', { name: 'history' }).pipe(
        Effect.provide(stubLayer(tree)),
      );
      Vitest.expect(report.specs[0]?.issues).toStrictEqual([]);
      Vitest.expect(report.warningCount).toBe(0);
    }),
  );

  Vitest.it.effect('accepts a series at the phase budget and fails one over it', () =>
    Effect.gen(function* () {
      const tree = new Map([
        [
          'budgeted',
          [
            entry(
              'SPEC.md',
              specMarkdown({
                name: 'budgeted',
                status: 'complete',
                lockedPhases: 'A',
                rows: [
                  {
                    id: 'A001',
                    name: 'implement-login',
                    type: 'execution',
                    status: 'complete',
                    gates: 'No',
                  },
                  {
                    id: 'A099',
                    name: 'review-phase',
                    type: 'review',
                    status: 'complete',
                    gates: 'No',
                  },
                ],
              }),
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({
                id: 'A001',
                name: 'implement-login',
                status: 'complete',
                size: 'tiny',
              }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'complete',
                size: 'tiny',
              }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const root = '.agents/@montflow/specs';
      const atBudget = yield* check(root, { name: 'budgeted' }).pipe(
        Effect.provide(
          stubLayer(tree, new Map(), { reviews: [{ name: 'budgeted', rounds: rounds(1) }] }),
        ),
      );
      Vitest.expect(atBudget.failed).toBe(0);
      Vitest.expect(atBudget.specs[0]?.issues).toStrictEqual([]);

      const over = yield* check(root, { name: 'budgeted' }).pipe(
        Effect.provide(
          stubLayer(tree, new Map(), { reviews: [{ name: 'budgeted', rounds: rounds(4) }] }),
        ),
      );
      Vitest.expect(over.failed).toBe(1);
      Vitest.expect(over.specs[0]?.issues).toStrictEqual([
        {
          code: 'review.budget-exceeded',
          field: 'review-series',
          message:
            "Review series 'budgeted' holds 4 rounds attributed to phase 'A'; the phase budget is 1.",
          expected: "at most 1 round for phase 'A'",
          actual: '4 rounds',
          fix: "Record the escalation in phase 'A' review task's MEMORY.md and ask the user; no further round may be opened in series 'budgeted'. The budget is the largest non-review task size in phase 'A'.",
        },
      ]);

      // Exactly one over the budget, so an off-by-one that grants an extra
      // cycle cannot pass the far-over case above.
      const oneOver = yield* check(root, { name: 'budgeted' }).pipe(
        Effect.provide(
          stubLayer(tree, new Map(), { reviews: [{ name: 'budgeted', rounds: rounds(2) }] }),
        ),
      );
      Vitest.expect(oneOver.failed).toBe(1);
      Vitest.expect(oneOver.specs[0]?.issues).toHaveLength(1);
      Vitest.expect(oneOver.specs[0]?.issues[0]?.actual).toBe('2 rounds');
    }),
  );
});

/** A pending tiny phase whose tasks buy exactly one review cycle. */
const pendingTiny = new Map([
  [
    'budgeted',
    [
      entry(
        'SPEC.md',
        specMarkdown({
          name: 'budgeted',
          rows: [
            {
              id: 'A001',
              name: 'implement-login',
              type: 'execution',
              status: 'pending',
              gates: 'No',
            },
            { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
          ],
        }),
      ),
      entry(
        'A001-implement-login/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement-login', size: 'tiny' }),
      ),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'pending' }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ],
  ],
]);

Vitest.describe('Cli.review budget dispatch truth runtime', () => {
  const root = '.agents/@montflow/specs';
  const overBudget = stubLayer(pendingTiny, new Map(), {
    reviews: [{ name: 'budgeted', rounds: rounds(2) }],
  });

  Vitest.it.effect('check, status, and next agree an over-budget phase is not dispatchable', () =>
    Effect.gen(function* () {
      const checked = yield* check(root, { name: 'budgeted' }).pipe(Effect.provide(overBudget));
      const reported = yield* status(root, 'budgeted').pipe(Effect.provide(overBudget));
      const ready = yield* next(root, 'budgeted').pipe(Effect.provide(overBudget));

      Vitest.expect(checked.failed).toBe(1);
      Vitest.expect(dispatchExitCode(reported.sizing, reported.verify, reported.name)).toBe(1);
      Vitest.expect(dispatchExitCode(ready.sizing, ready.verify, ready.name)).toBe(1);
      // One review input, one verdict: the surfaces report the same findings.
      Vitest.expect(new Set(checked.specs[0]?.issues.map((found) => found.field))).toStrictEqual(
        new Set(reported.verify.issues.map((found) => found.field)),
      );
      Vitest.expect(dispatchErrorText(reported.sizing, reported.verify, reported.name)).toContain(
        'review.budget-exceeded',
      );
      // The ready set still names the phase, but prints no dispatch target.
      Vitest.expect(renderNext(ready)).toContain('A001');
      Vitest.expect(renderNext(ready)).not.toContain('inherit');
    }),
  );

  Vitest.it.effect('status and next read the review series exactly like check', () =>
    Effect.gen(function* () {
      const clean = stubLayer(pendingTiny, new Map(), {
        reviews: [{ name: 'budgeted', rounds: rounds(1) }],
      });
      const checked = yield* check(root, { name: 'budgeted' }).pipe(Effect.provide(clean));
      const reported = yield* status(root, 'budgeted').pipe(Effect.provide(clean));
      const ready = yield* next(root, 'budgeted').pipe(Effect.provide(clean));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(dispatchExitCode(reported.sizing, reported.verify, reported.name)).toBe(0);
      Vitest.expect(dispatchExitCode(ready.sizing, ready.verify, ready.name)).toBe(0);
    }),
  );

  Vitest.it.effect('warns for an unattributed round and fails the same tree under --strict', () =>
    Effect.gen(function* () {
      const unattributed = stubLayer(pendingTiny, new Map(), {
        reviews: [
          {
            name: 'budgeted',
            rounds: [{ round: '001' }, { round: '002' }, { round: '003' }],
          },
        ],
      });
      const advisory = yield* check(root, { name: 'budgeted' }).pipe(Effect.provide(unattributed));
      Vitest.expect(advisory.failed).toBe(0);
      Vitest.expect(advisory.warningCount).toBe(3);
      Vitest.expect(advisory.specs[0]?.issues.map((found) => found.code)).toStrictEqual([
        'review.phase-unattributed',
        'review.phase-unattributed',
        'review.phase-unattributed',
      ]);
      Vitest.expect(renderCheck(advisory, false)).toContain('review.phase-unattributed \u00d7 3');

      const strict = yield* check(root, { name: 'budgeted', strict: true }).pipe(
        Effect.provide(unattributed),
      );
      Vitest.expect(strict.failed).toBe(1);
      Vitest.expect(checkExitCode(strict)).toBe(1);
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
  rootIssues: [],
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
  rootIssues: [],
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

/** The grouped-warning line a check report renders, if it has one. */
const groupLine = (checked: CheckReport): string =>
  renderCheck(checked, false).split('\n')[1] ?? '';

/** A coded warning for a file inside a spec, as the verifiers emit them. */
const codedWarning = (code: string, field: string, message = 'Advisory finding.') =>
  finding({ code, field, message, severity: 'warning' });

const groupedReport: CheckReport = {
  root: '.agents/@montflow/specs',
  specs: [
    {
      name: 'alpha',
      valid: true,
      issues: [
        codedWarning(
          'task.missing-size',
          'A001-x/TASK.md: size',
          'Completed task declares no size.',
        ),
        codedWarning(
          'task.missing-size',
          'A002-y/TASK.md: size',
          'Completed task declares no size.',
        ),
        codedWarning(
          'task.completion-unchecked',
          'A001-x/TASK.md: completion',
          'Unchecked completion item.',
        ),
      ],
    },
    {
      name: 'beta',
      valid: true,
      issues: [
        codedWarning(
          'task.missing-size',
          'B001-z/TASK.md: size',
          'Completed task declares no size.',
        ),
      ],
    },
  ],
  rootIssues: [],
  failed: 0,
  issueCount: 0,
  warningCount: 4,
};

Vitest.describe('Cli.renderCheck warning grouping runtime', () => {
  Vitest.it('groups one code across specs and several codes in one spec', () => {
    Vitest.expect(renderCheck(groupedReport, false)).toBe(
      [
        '\u2713 alpha (3 warnings)',
        '  ! task.completion-unchecked \u00d7 1 \u00b7 alpha/A001-x/TASK.md \u00b7 task.missing-size \u00d7 2 \u00b7 alpha/A001-x/TASK.md',
        '\u2713 beta (1 warning)',
        '  ! task.missing-size \u00d7 1 \u00b7 beta/B001-z/TASK.md',
        '',
        '2 specs \u00b7 0 failed \u00b7 0 issues \u00b7 4 warnings',
      ].join('\n'),
    );
  });

  Vitest.it('expands every grouped warning into its full block under --verbose', () => {
    const verbose = renderCheck(groupedReport, true);
    Vitest.expect(verbose.match(/code {5}! task\.missing-size/g)).toHaveLength(3);
    Vitest.expect(verbose).toContain('  code     ! task.completion-unchecked');
    Vitest.expect(verbose).toContain('  path     alpha/A002-y/TASK.md');
    Vitest.expect(verbose).toContain('  path     beta/B001-z/TASK.md');
    Vitest.expect(verbose).not.toContain('\u00d7');
  });

  Vitest.it('keeps each error in its full block beside the warning groups', () => {
    const mixed = reduceCheck(
      '.agents/@montflow/specs',
      [
        { name: 'alpha', issues: [codedWarning('task.missing-size', 'A001-x/TASK.md: size')] },
        {
          name: 'beta',
          issues: [
            finding({
              code: 'sizing.malformed-json',
              field: 'sizing.json: root',
              message: 'Config is not valid JSON.',
            }),
          ],
        },
      ],
      false,
    );
    const text = renderCheck(mixed, false);
    Vitest.expect(text).toContain('\u2717 beta (1)');
    Vitest.expect(text).toContain('  code     sizing.malformed-json');
    Vitest.expect(text).toContain('  ! task.missing-size \u00d7 1 \u00b7 alpha/A001-x/TASK.md');
    Vitest.expect(text).not.toContain('code     ! task.missing-size');
  });

  Vitest.it('renders the same group line whatever order the findings arrive in', () => {
    const root = '.agents/@montflow/specs';
    const findings = [
      codedWarning('task.missing-size', 'A002-y/TASK.md: size'),
      codedWarning('gate.unchecked', 'A001-x/GATES.md: gate'),
      codedWarning('task.completion-unchecked', 'A001-x/TASK.md: completion'),
      codedWarning('task.missing-size', 'A001-x/TASK.md: size'),
    ];
    const forward = reduceCheck(root, [{ name: 'alpha', issues: findings }], false);
    const reversed = reduceCheck(root, [{ name: 'alpha', issues: findings.toReversed() }], false);
    Vitest.expect(groupLine(reversed)).toBe(groupLine(forward));
    Vitest.expect(groupLine(forward)).toBe(
      '  ! gate.unchecked \u00d7 1 \u00b7 alpha/A001-x/GATES.md \u00b7 task.completion-unchecked \u00d7 1 \u00b7 alpha/A001-x/TASK.md \u00b7 task.missing-size \u00d7 2 \u00b7 alpha/A001-x/TASK.md',
    );
  });

  Vitest.it('renders no group line when a spec has no warnings', () => {
    const clean: CheckReport = {
      ...report,
      specs: [{ name: 'ok', valid: true, issues: [] }],
      failed: 0,
      issueCount: 0,
    };
    Vitest.expect(renderCheck(clean, false)).toBe('1 spec \u00b7 0 failed \u00b7 0 issues');
  });

  Vitest.it('renders promoted warnings as full errors under --strict', () => {
    const strict = reduceCheck(
      '.agents/@montflow/specs',
      [
        {
          name: 'alpha',
          issues: [
            codedWarning('task.missing-size', 'A001-x/TASK.md: size'),
            codedWarning('task.missing-size', 'A002-y/TASK.md: size'),
          ],
        },
      ],
      true,
    );
    const text = renderCheck(strict, false);
    Vitest.expect(strict.specs[0]?.valid).toBe(false);
    Vitest.expect(strict.warningCount).toBe(0);
    Vitest.expect(strict.issueCount).toBe(2);
    Vitest.expect(checkExitCode(strict)).toBe(1);
    Vitest.expect(text).toContain('\u2717 alpha (2)');
    Vitest.expect(text).toContain('  code     task.missing-size');
    Vitest.expect(text).not.toContain('\u2713');
    Vitest.expect(text).not.toContain('\u00d7');
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

Vitest.describe('Cli.check diagnostics runtime', () => {
  Vitest.it.effect('adds a malformed repo config cause chain only under --verbose', () =>
    Effect.gen(function* () {
      const malformed = stubLayer(new Map(), new Map([['sizing.json', '{"sizes": {']]));
      const checked = yield* check('.agents/@montflow/specs').pipe(Effect.provide(malformed));
      Vitest.expect(checked.rootIssues[0]?.cause).toBeDefined();
      Vitest.expect(checked.rootIssues[0]?.layers).toStrictEqual({
        consulted: ['repo'],
        layer: 'repo',
      });

      const compact = renderCheck(checked, false);
      Vitest.expect(compact).toBe(
        [
          '\u2717 sizing.json (1)',
          '  code     sizing.malformed-json',
          '  path     sizing.json',
          '  field    root',
          '  problem  Config is not valid JSON.',
          '  expected a JSON object with a "sizes" map',
          '  actual   unparseable JSON',
          '  fix      Rewrite sizing.json as valid JSON.',
          '  next     mf-specs check',
          '',
          '0 specs \u00b7 1 config \u00b7 1 failed \u00b7 1 issue',
        ].join('\n'),
      );
      Vitest.expect(compact).not.toContain('cause');
      Vitest.expect(compact).not.toContain('layers');

      const verbose = renderCheck(checked, true);
      Vitest.expect(checked.rootIssues[0]?.cause).toBeInstanceOf(SyntaxError);
      Vitest.expect(verbose).toMatch(/  cause    .*position \d+/);
      Vitest.expect(verbose).not.toContain('Expected a valid JSON string');
      Vitest.expect(verbose).toContain('  layers   consulted repo \u00b7 layer repo');
    }),
  );

  Vitest.it.effect('traces the layers consulted by spec-config and task-size findings', () =>
    Effect.gen(function* () {
      const traced = new Map([
        [
          'traced',
          [
            entry('SPEC.md', specMarkdown({ name: 'traced' })),
            entry('sizing.json', '{"sizes": {"huge": {"model": "a/b"}}}'),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login', withoutSize: true }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const checked = yield* check('.agents/@montflow/specs', { name: 'traced' }).pipe(
        Effect.provide(stubLayer(traced)),
      );
      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain('  layers   consulted repo,spec \u00b7 layer spec');
      Vitest.expect(verbose).toContain('  layers   consulted repo,spec,phase \u00b7 phase A');
      Vitest.expect(renderCheck(checked, false)).not.toContain('layers');
    }),
  );

  Vitest.it.effect('traces a nested phase override as the phase layer', () =>
    Effect.gen(function* () {
      const traced = new Map([
        [
          'traced',
          [
            entry('SPEC.md', specMarkdown({ name: 'traced' })),
            entry(
              'sizing.json',
              '{"sizes": {}, "phases": {"A": {"sizes": {"huge": {"model": "a/b"}}}}}',
            ),
            entry(
              'A001-implement-login/TASK.md',
              taskMarkdown({ id: 'A001', name: 'implement-login' }),
            ),
            entry('A001-implement-login/MEMORY.md', memory),
            entry(
              'A099-review-phase/TASK.md',
              taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
            ),
            entry('A099-review-phase/MEMORY.md', memory),
          ],
        ],
      ]);
      const checked = yield* check('.agents/@montflow/specs', { name: 'traced' }).pipe(
        Effect.provide(stubLayer(traced)),
      );
      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain(
        '  layers   consulted repo,spec,phase \u00b7 layer phase \u00b7 phase A',
      );
    }),
  );

  Vitest.it('leaves non-sizing findings on their terse line under --verbose', () => {
    const legacy: CheckReport = {
      ...report,
      specs: [
        {
          name: 'bad',
          valid: false,
          issues: [{ field: 'notes.txt', message: 'Unexpected file at the spec root.' }],
        },
      ],
      issueCount: 1,
      failed: 1,
    };
    const verbose = renderCheck(legacy, true);
    Vitest.expect(verbose).toContain('  notes.txt: Unexpected file at the spec root.');
    Vitest.expect(verbose).not.toContain('layers');
    Vitest.expect(verbose).not.toContain('cause');
  });

  Vitest.it.effect('renders an unreadable config as a coded finding and keeps aggregating', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.readRootFile',
        reason: 'PermissionDenied: FileSystem.readFile (/store/sizing.json)',
        path: 'sizing.json',
        cause: new Error('EACCES: permission denied, open sizing.json'),
      });
      const store = stubLayer(specs, new Map(), { rootFileFailure: failure });
      const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(store),
      );
      Vitest.expect(checked.rootIssues[0]?.code).toBe('store.error');
      Vitest.expect(checked.rootIssues[0]?.cause).toBeInstanceOf(Error);
      Vitest.expect(checked.specs[0]?.valid).toBe(true);
      Vitest.expect(checkExitCode(checked)).toBe(1);

      const verbose = renderCheck(checked, true);
      Vitest.expect(verbose).toContain('\u2717 sizing.json (1)');
      Vitest.expect(verbose).toContain('  code     store.error');
      Vitest.expect(verbose).toContain('  path     sizing.json');
      Vitest.expect(verbose).toContain('  field    root');
      Vitest.expect(verbose).toContain('  cause    EACCES: permission denied, open sizing.json');
      Vitest.expect(verbose).toContain('1 spec \u00b7 1 config \u00b7 1 failed \u00b7 1 issue');
    }),
  );

  Vitest.it.effect('counts the config as the failed unit when only the config fails', () =>
    Effect.gen(function* () {
      const broken = stubLayer(new Map(), new Map([['sizing.json', '{"sizes": {']]));
      const checked = yield* check('.agents/@montflow/specs').pipe(Effect.provide(broken));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(renderCheck(checked, false)).toContain(
        '0 specs \u00b7 1 config \u00b7 1 failed \u00b7 1 issue',
      );
    }),
  );

  Vitest.it.effect('reports an unreadable spec directory as a coded finding', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.snapshot',
        reason: 'PermissionDenied: FileSystem.readDirectory',
        path: 'ok/A001-x/TASK.md',
        cause: new Error('EACCES: permission denied, scandir ok/A001-x/TASK.md'),
      });
      const store = stubLayer(specs, new Map(), { snapshotFailure: failure });
      const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(store),
      );
      Vitest.expect(checked.specs[0]?.valid).toBe(false);
      Vitest.expect(checked.specs[0]?.issues[0]?.code).toBe('store.error');
      Vitest.expect(renderCheck(checked, false)).toContain('  path     ok/A001-x/TASK.md');
      Vitest.expect(checkExitCode(checked)).toBe(1);
    }),
  );
  Vitest.it.effect(
    'reports an unreadable spec directory once, without doubling the spec name',
    () =>
      Effect.gen(function* () {
        const failure = new SpecStore.StoreError({
          operation: 'SpecStore.snapshot',
          reason: 'PermissionDenied: FileSystem.readDirectory',
          path: '.agents/@montflow/specs/ok',
          cause: new Error('EACCES: permission denied, scandir ok'),
        });
        const store = stubLayer(specs, new Map(), { snapshotFailure: failure });
        const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
          Effect.provide(store),
        );
        const rendered = renderCheck(checked, false);
        Vitest.expect(rendered).toContain('  path     ok');
        Vitest.expect(rendered).toContain('  field    root');
        Vitest.expect(rendered).not.toContain('ok/ok');
        Vitest.expect(checkExitCode(checked)).toBe(1);
      }),
  );

  Vitest.it.effect('reports an unreadable review store as a review-series finding', () =>
    Effect.gen(function* () {
      const failure = new SpecStore.StoreError({
        operation: 'SpecStore.reviewSeries',
        reason: "Cannot read the review store entry 'reviews/ok/001/REVIEW.md': EACCES",
        path: '/machine/.agents/@montflow/reviews/ok/001/REVIEW.md',
        origin: 'reviews',
        cause: new Error('EACCES: permission denied, open REVIEW.md'),
      });
      const store = stubLayer(specs, new Map(), { reviewFailure: failure });
      const checked = yield* check('.agents/@montflow/specs', { name: 'ok' }).pipe(
        Effect.provide(store),
      );
      Vitest.expect(checked.specs[0]?.valid).toBe(false);
      Vitest.expect(checked.specs[0]?.issues[0]).toMatchObject({
        code: 'store.error',
        // Nested so the renderer prefixes the spec name: `path <spec>/review-series`.
        field: 'review-series: review-series',
        expected: 'a readable review store',
        fix: 'Check that the review store beside the specs store is readable; every round must expose a readable REVIEW.md.',
      });
      Vitest.expect(checkExitCode(checked)).toBe(1);

      const rendered = renderCheck(checked, true);
      // One canonical locator for the same failure on every surface.
      Vitest.expect(rendered).toContain('  path     ok/review-series');
      Vitest.expect(rendered).toContain('  field    review-series');
      // The absolute platform path never reaches `path` or `problem`.
      Vitest.expect(rendered).not.toContain('/machine/');
      Vitest.expect(rendered).toContain('  cause    EACCES: permission denied, open REVIEW.md');
      Vitest.expect(rendered).not.toContain('field    root');
    }),
  );
});

Vitest.describe('Cli command Cause diagnosis runtime', () => {
  Vitest.it.effect('labels an injected defect internal, exits 2, and hides the stack', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(Effect.die(new Error('boom')), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      }));
      const exitCode = process.exitCode;
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(exitCode).toBe(INTERNAL_EXIT_CODE);
      Vitest.expect(logged).toContain('code     internal');
      Vitest.expect(logged).toContain('problem  Internal defect: boom');
      Vitest.expect(logged).not.toContain('    at ');
    }),
  );

  Vitest.it.effect('reports a usage rejection as its own message, not an unhandled failure', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(
        Effect.fail(
          new CliError.UserError({
            cause: "Unknown status 'bogus'.",
            userMessage: "Unknown status 'bogus'.",
          }),
        ),
        () => ({
          path: 'ship-spec',
          rerun: 'mf-specs list',
          verbose: false,
        }),
      );
      const exitCode = process.exitCode;
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(exitCode).toBe(1);
      Vitest.expect(logged).toContain("Unknown status 'bogus'.");
      Vitest.expect(logged).not.toContain('failure.unhandled');
    }),
  );

  Vitest.it.effect('shows the stack of an injected defect under --verbose', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* runDiagnosed(Effect.die(new Error('boom')), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: true,
      }));
      process.exitCode = before;
      const logged = (yield* TestConsole.logLines).map(String).join('\n');
      Vitest.expect(logged).toContain('stack    Error: boom');
    }),
  );

  Vitest.it.effect('runs the body and prints nothing extra on success', () =>
    Effect.gen(function* () {
      yield* runDiagnosed(Effect.succeed('done'), () => ({
        path: 'ship-spec',
        rerun: 'mf-specs check --name ship-spec',
        verbose: false,
      }));
      Vitest.expect(yield* TestConsole.logLines).toStrictEqual([]);
    }),
  );
});

Vitest.describe('Cli.check catalog runtime', () => {
  Vitest.it.effect('clean check with a matching catalogue', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-catalog-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          default: null,
          models: [{ providerID: 'fixture', modelID: 'repo-model', variants: ['low'] }],
        }),
      );
      const sizing = JSON.stringify({
        sizes: { tiny: { model: 'fixture/repo-model', effort: 'low' } },
      });
      const layer = stubLayer(new Map(), new Map([['sizing.json', sizing]]));
      const checked = yield* check('.agents/@montflow/specs', { catalog: file }).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(checkExitCode(checked)).toBe(0);
      Vitest.expect(checked.rootIssues).toStrictEqual([]);
      Vitest.expect(checked.failed).toBe(0);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('flags an unknown model against the catalogue', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-catalog-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          default: null,
          models: [{ providerID: 'fixture', modelID: 'repo-model', variants: ['low'] }],
        }),
      );
      const sizing = JSON.stringify({ sizes: { tiny: { model: 'fixture/ghost', effort: 'low' } } });
      const layer = stubLayer(new Map(), new Map([['sizing.json', sizing]]));
      const checked = yield* check('.agents/@montflow/specs', { catalog: file }).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(checkExitCode(checked)).toBe(1);
      Vitest.expect(renderCheck(checked, false)).toContain('models.unknown-model');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('flags an unknown effort against the catalogue', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-catalog-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          default: null,
          models: [{ providerID: 'fixture', modelID: 'repo-model', variants: ['low'] }],
        }),
      );
      const sizing = JSON.stringify({
        sizes: { tiny: { model: 'fixture/repo-model', effort: 'high' } },
      });
      const layer = stubLayer(new Map(), new Map([['sizing.json', sizing]]));
      const checked = yield* check('.agents/@montflow/specs', { catalog: file }).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(checkExitCode(checked)).toBe(1);
      Vitest.expect(renderCheck(checked, false)).toContain('models.unknown-effort');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('reports a malformed catalogue file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-catalog-' });
      const file = path.join(dir, 'catalog.json');
      yield* fs.writeFileString(file, '{ not json');
      const layer = stubLayer(new Map());
      const checked = yield* check('.agents/@montflow/specs', { catalog: file }).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(checkExitCode(checked)).toBe(1);
      Vitest.expect(renderCheck(checked, false)).toContain('models.malformed-catalog');
    }).pipe(Effect.provide(Platform)),
  );
});

const profileTree = (reviewerProfiles: string): Map<string, ReadonlyArray<SpecFileEntry>> =>
  new Map([
    [
      'ship-spec',
      [
        entry('SPEC.md', specMarkdown({ name: 'ship-spec' })),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', status: 'pending' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({
            id: 'A099',
            name: 'review-phase',
            type: 'review',
            status: 'pending',
            reviewerProfiles,
          }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ],
    ],
  ]);

Vitest.describe('Cli.check reviewer-profile.unknown runtime', () => {
  Vitest.it.effect('is silent when the declared profile exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-profiles-' });
      const root = path.join(base, 'specs');
      const profilesRoot = path.join(base, 'profiles');
      yield* fs.makeDirectory(path.join(profilesRoot, 'example-reviewer'), { recursive: true });
      yield* fs.writeFileString(
        path.join(profilesRoot, 'example-reviewer', 'PROFILE.md'),
        '# Profile',
      );
      const layer = stubLayer(profileTree('example-reviewer'));
      const checked = yield* check(root, { name: 'ship-spec' }).pipe(Effect.provide(layer));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(checked.warningCount).toBe(0);
      Vitest.expect(checked.specs[0]?.issues).toStrictEqual([]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('warns for an absent declared profile', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-profiles-' });
      const root = path.join(base, 'specs');
      const profilesRoot = path.join(base, 'profiles');
      yield* fs.makeDirectory(profilesRoot, { recursive: true });
      const layer = stubLayer(profileTree('ghost-reviewer'));
      const checked = yield* check(root, { name: 'ship-spec' }).pipe(Effect.provide(layer));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(checked.warningCount).toBe(1);
      Vitest.expect(checked.specs[0]?.issues).toStrictEqual([
        {
          code: 'reviewer-profile.unknown',
          severity: 'warning',
          field: 'A099-review-phase/TASK.md: reviewer-profiles',
          message:
            "Declared reviewer profile 'ghost-reviewer' was not found under .agents/@montflow/profiles.",
          actual: 'ghost-reviewer',
          fix: "Create .agents/@montflow/profiles/ghost-reviewer/PROFILE.md or remove 'ghost-reviewer' from reviewer-profiles.",
        },
      ]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('is silent when the profiles root is missing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-profiles-' });
      const root = path.join(base, 'specs');
      // no profiles directory created
      const layer = stubLayer(profileTree('ghost-reviewer'));
      const checked = yield* check(root, { name: 'ship-spec' }).pipe(Effect.provide(layer));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(checked.warningCount).toBe(0);
      Vitest.expect(checked.specs[0]?.issues).toStrictEqual([]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('warns once per absent slug when several are declared', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-profiles-' });
      const root = path.join(base, 'specs');
      const profilesRoot = path.join(base, 'profiles');
      yield* fs.makeDirectory(path.join(profilesRoot, 'example-reviewer'), { recursive: true });
      yield* fs.writeFileString(
        path.join(profilesRoot, 'example-reviewer', 'PROFILE.md'),
        '# Profile',
      );
      const layer = stubLayer(profileTree('example-reviewer, missing-a, missing-b'));
      const checked = yield* check(root, { name: 'ship-spec' }).pipe(Effect.provide(layer));
      Vitest.expect(checked.failed).toBe(0);
      Vitest.expect(checked.warningCount).toBe(2);
      Vitest.expect(checked.specs[0]?.issues.map((found) => found.actual)).toStrictEqual([
        'missing-a',
        'missing-b',
      ]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('promotes the warning to a failure under --strict', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-check-profiles-' });
      const root = path.join(base, 'specs');
      const profilesRoot = path.join(base, 'profiles');
      yield* fs.makeDirectory(profilesRoot, { recursive: true });
      const layer = stubLayer(profileTree('ghost-reviewer'));
      const checked = yield* check(root, { name: 'ship-spec', strict: true }).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(checked.failed).toBe(1);
      Vitest.expect(checked.warningCount).toBe(0);
      Vitest.expect(checked.issueCount).toBe(1);
      Vitest.expect(checkExitCode(checked)).toBe(1);
    }).pipe(Effect.provide(Platform)),
  );
});
