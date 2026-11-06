import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Fs from 'node:fs';
import { Effect, FileSystem, Layer, Path } from 'effect';

import { SpecStore } from '../../../services/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { USAGE_EXIT_CODE, decideRun, reviewDecide } from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const Store = Layer.mergeAll(Layer.provide(SpecStore.Default, Platform), Platform);
const Root = '.agents/@montflow/specs';

/** A minimal v2 phase C tree with one review task. */
const tree = () => [
  entry(
    'SPEC.md',
    specMarkdown({
      version: '2',
      rows: [
        { id: 'C001', name: 'implement', type: 'execution', status: 'complete', gates: 'No' },
        { id: 'C099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ),
  entry('C/PHASE.md', phaseMarkdown({ id: 'C', review: 'required' })),
  entry('C/MEMORY.md', memory),
  entry(
    'C/C001-implement/TASK.md',
    taskMarkdown({ id: 'C001', name: 'implement', status: 'complete' }),
  ),
  entry('C/C001-implement/MEMORY.md', memory),
  entry(
    'C/C099-review-phase/TASK.md',
    taskMarkdown({ id: 'C099', name: 'review-phase', type: 'review' }),
  ),
  entry('C/C099-review-phase/MEMORY.md', memory),
];

Vitest.describe('Cli.reviewDecide runtime', () => {
  Vitest.it.effect('returns start for a phase with no attributed round', () => {
    const specs = new Map([['ship-login', tree()]]);
    return Effect.gen(function* () {
      const report = yield* reviewDecide({
        name: 'ship-login',
        phase: 'C',
        mode: 'guided',
        root: Root,
      });
      Vitest.expect(report.decision).toBe('start');
      Vitest.expect(report.reason).toBe('review.round-missing');
      Vitest.expect(report.budget).toBe(3);
      Vitest.expect(report.series.map((seriesEntry) => seriesEntry.series)).toStrictEqual([
        'ship-login',
      ]);
    }).pipe(Effect.provide(stubLayer(specs)));
  });

  Vitest.it.effect('reads the declared reviewer profiles as expected series', () => {
    const specs = new Map([
      [
        'ship-login',
        [
          ...tree().filter((file) => file.path !== 'C/C099-review-phase/TASK.md'),
          entry(
            'C/C099-review-phase/TASK.md',
            taskMarkdown({
              id: 'C099',
              name: 'review-phase',
              type: 'review',
              reviewerProfiles: 'example-reviewer, security',
            }),
          ),
        ],
      ],
    ]);
    return Effect.gen(function* () {
      const report = yield* reviewDecide({
        name: 'ship-login',
        phase: 'C',
        mode: 'guided',
        root: Root,
      });
      Vitest.expect(report.series.map((seriesEntry) => seriesEntry.series)).toStrictEqual([
        'ship-login',
        'ship-login-example-reviewer',
        'ship-login-security',
      ]);
      Vitest.expect(report.decision).toBe('start');
    }).pipe(Effect.provide(stubLayer(specs)));
  });

  Vitest.it.effect('decides from attributed rounds in every expected series', () => {
    const specs = new Map([['ship-login', tree()]]);
    return Effect.gen(function* () {
      const report = yield* reviewDecide({
        name: 'ship-login',
        phase: 'C',
        mode: 'autonomous',
        root: Root,
      });
      Vitest.expect(report.decision).toBe('rework');
      Vitest.expect(report.rounds).toBe(1);
      Vitest.expect(report.open).toStrictEqual({ critical: 0, major: 1, minor: 0, nit: 0 });
    }).pipe(
      Effect.provide(
        stubLayer(specs, new Map(), {
          reviews: [
            {
              name: 'ship-login',
              rounds: [
                {
                  round: '003',
                  phase: 'C',
                  passed: false,
                  findings: [{ id: 'F1', severity: 'Major', status: 'Open' }],
                },
              ],
            },
          ],
        }),
      ),
    );
  });
});

Vitest.describe('Cli.reviewDecide usage', () => {
  const stub = () => stubLayer(new Map([['ship-login', tree()]]));

  Vitest.it.effect('exits 2 for a malformed phase without reading the store', () =>
    Effect.gen(function* () {
      const outcome = yield* decideRun({
        name: 'ship-login',
        phase: 'zz',
        mode: 'guided',
        root: Root,
        json: false,
      });
      Vitest.expect(outcome.exitCode).toBe(USAGE_EXIT_CODE);
      Vitest.expect(outcome.output).toContain('cli.invalid-argument');
    }).pipe(Effect.provide(stub())),
  );

  Vitest.it.effect('exits 2 for an unknown mode', () =>
    Effect.gen(function* () {
      const outcome = yield* decideRun({
        name: 'ship-login',
        phase: 'C',
        mode: 'sometimes',
        root: Root,
        json: false,
      });
      Vitest.expect(outcome.exitCode).toBe(2);
      Vitest.expect(outcome.output).toContain("'sometimes' is not a review mode");
    }).pipe(Effect.provide(stub())),
  );

  Vitest.it.effect('exits 2 for a missing --name or --phase', () =>
    Effect.gen(function* () {
      const missingName = yield* decideRun({
        name: undefined,
        phase: 'C',
        mode: undefined,
        root: Root,
        json: false,
      });
      Vitest.expect(missingName.exitCode).toBe(2);
      Vitest.expect(missingName.output).toContain('requires --name');
      const missingPhase = yield* decideRun({
        name: 'ship-login',
        phase: undefined,
        mode: undefined,
        root: Root,
        json: false,
      });
      Vitest.expect(missingPhase.exitCode).toBe(2);
      Vitest.expect(missingPhase.output).toContain('requires --phase');
    }).pipe(Effect.provide(stub())),
  );

  Vitest.it.effect('exits 2 for a phase the spec does not have', () =>
    Effect.gen(function* () {
      const outcome = yield* decideRun({
        name: 'ship-login',
        phase: 'D',
        mode: undefined,
        root: Root,
        json: false,
      });
      Vitest.expect(outcome.exitCode).toBe(2);
      Vitest.expect(outcome.output).toContain("Phase 'D' does not exist");
    }).pipe(Effect.provide(stub())),
  );

  Vitest.it.effect('renders JSON with the same fields', () =>
    Effect.gen(function* () {
      const outcome = yield* decideRun({
        name: 'ship-login',
        phase: 'C',
        mode: 'guided',
        root: Root,
        json: true,
      });
      Vitest.expect(outcome.exitCode).toBe(0);
      // SAFETY: decideRun rendered this JSON from ReviewDecisionReport, so the
      // asserted fields are the contract that renderer produced.
      const parsed = JSON.parse(outcome.output) as {
        decision: string;
        rounds: number;
        budget: number;
        reason: string;
        open: unknown;
        series: ReadonlyArray<unknown>;
      };
      Vitest.expect(parsed.decision).toBe('start');
      Vitest.expect(parsed.reason).toBe('review.round-missing');
      Vitest.expect(parsed.rounds).toBe(0);
      Vitest.expect(parsed.budget).toBe(3);
      Vitest.expect(parsed.open).toStrictEqual({ critical: 0, major: 0, minor: 0, nit: 0 });
      Vitest.expect(parsed.series).toHaveLength(1);
    }).pipe(Effect.provide(stub())),
  );
});

Vitest.describe('Cli.reviewDecide is read-only', () => {
  Vitest.it.effect('leaves every file content and mtime unchanged', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped();
      const root = path.join(workspace, '.agents', '@montflow', 'specs');
      const specDir = path.join(root, 'ship-login');
      const reviewDir = path.join(
        workspace,
        '.agents',
        '@montflow',
        'reviews',
        'ship-login',
        '003',
      );
      yield* fs.makeDirectory(path.join(specDir, 'C', 'C001-implement'), { recursive: true });
      yield* fs.makeDirectory(path.join(specDir, 'C', 'C099-review-phase'), { recursive: true });
      yield* fs.makeDirectory(reviewDir, { recursive: true });
      const files = new Map([
        [
          path.join(specDir, 'SPEC.md'),
          specMarkdown({
            version: '2',
            rows: [
              { id: 'C001', name: 'implement', type: 'execution', status: 'complete', gates: 'No' },
              { id: 'C099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ],
        [path.join(specDir, 'C', 'PHASE.md'), phaseMarkdown({ id: 'C', review: 'required' })],
        [path.join(specDir, 'C', 'MEMORY.md'), memory],
        [
          path.join(specDir, 'C', 'C001-implement', 'TASK.md'),
          taskMarkdown({ id: 'C001', name: 'implement', status: 'complete' }),
        ],
        [path.join(specDir, 'C', 'C001-implement', 'MEMORY.md'), memory],
        [
          path.join(specDir, 'C', 'C099-review-phase', 'TASK.md'),
          taskMarkdown({ id: 'C099', name: 'review-phase', type: 'review' }),
        ],
        [path.join(specDir, 'C', 'C099-review-phase', 'MEMORY.md'), memory],
        [
          path.join(reviewDir, 'REVIEW.md'),
          [
            '# Review: ship-login / 003',
            '',
            '## Metadata',
            '- Round: 003',
            '- Phase: C',
            '- Status: open',
            '',
            '## Findings',
            '',
            '### F1 — a major defect',
            '- Severity: Major',
            '- Status: Open',
            '',
            '## Summary',
            '',
          ].join('\n'),
        ],
      ]);
      for (const [file, content] of files) yield* fs.writeFileString(file, content);
      const before = new Map<string, { content: string; mtime: number }>();
      for (const [file] of files) {
        before.set(file, {
          content: yield* fs.readFileString(file),
          mtime: Fs.statSync(file).mtimeMs,
        });
      }

      const outcome = yield* decideRun({
        name: 'ship-login',
        phase: 'C',
        mode: 'guided',
        root,
        json: true,
      });
      Vitest.expect(outcome.exitCode).toBe(0);
      Vitest.expect(JSON.parse(outcome.output)).toMatchObject({
        decision: 'rework',
        reason: 'review.budget-remaining',
        rounds: 1,
        budget: 3,
      });

      for (const [file, expected] of before) {
        Vitest.expect(Fs.statSync(file).mtimeMs, file).toBe(expected.mtime);
        Vitest.expect(yield* fs.readFileString(file), file).toBe(expected.content);
      }
    }).pipe(Effect.provide(Store)),
  );
});
