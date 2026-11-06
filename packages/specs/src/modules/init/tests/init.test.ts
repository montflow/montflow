import * as Vitest from '@effect/vitest';

import { phaseEvidence } from '../../phase/index.js';
import { analyze } from '../../lifecycle/index.js';
import { CODES as RIGOR_CODES } from '../../rigor/index.js';
import type { SpecFileEntry } from '../../structure/index.js';
import { NO_REVIEW, verifySpecTree } from '../../structure/index.js';
import { parseTaskFile } from '../../task/index.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { specMarkdown } from '../../spec/tests/helpers.js';
import {
  INIT_CODES,
  defaultInitPhases,
  gateTemplateFor,
  renderInitTree,
  validateInitPlan,
} from '../index.js';
import type { InitPhasePlan, InitPlan } from '../index.js';

const plan = (rigor: InitPlan['rigor'], phases: ReadonlyArray<InitPhasePlan>): InitPlan => ({
  name: 'ship-login',
  rigor,
  author: 'test',
  created: '2026-11-03',
  workspaceType: 'in-place',
  reviewerProfiles: [],
  phases,
});

const work = (
  name: string,
  type: InitPhasePlan['tasks'][number]['type'],
  after: string[] = [],
) => ({
  name,
  type,
  size: 'medium' as const,
  after,
});

const codes = (issues: ReadonlyArray<{ code?: string }>) => issues.map((issue) => issue.code);

Vitest.describe('Init.rigors runtime', () => {
  Vitest.it('renders a trivial tree with a default waiver and no review task', () => {
    const files = renderInitTree(plan('trivial', defaultInitPhases('trivial')));
    const paths = files.map((file) => file.path);
    Vitest.expect(paths).toContain('A/PHASE.md');
    Vitest.expect(paths).toContain('A/A001-implement/GATES.md');
    Vitest.expect(paths.some((path) => path.includes('review-phase'))).toBe(false);
    Vitest.expect(paths.some((path) => path.endsWith('BOARD.md'))).toBe(false);
    const phase = files.find((file) => file.path === 'A/PHASE.md')?.content ?? '';
    Vitest.expect(phase).toContain('review: waived');
    Vitest.expect(phase).toContain('trivial rigor default');
    Vitest.expect(phase).toContain('review-evidence: A001:0');
    Vitest.expect(verifySpecTree({ name: 'ship-login', files }, NO_REVIEW).valid).toBe(true);
  });

  Vitest.it('writes the task memory section set and keeps the brief phase-only', () => {
    const files = renderInitTree(plan('trivial', defaultInitPhases('trivial')));
    const taskMemory = files.find((file) => file.path === 'A/A001-implement/MEMORY.md')?.content;
    const phaseMemory = files.find((file) => file.path === 'A/MEMORY.md')?.content;
    for (const section of [
      'Context',
      'Progress',
      'Findings',
      'Gates',
      'Open Questions',
      'Handoff',
      'Deviations',
    ]) {
      Vitest.expect(taskMemory).toContain(`## ${section}`);
    }
    Vitest.expect(taskMemory).not.toContain('## Execution Brief');
    Vitest.expect(phaseMemory).toContain('## Execution Brief');
  });

  Vitest.it('renders standard, deep, and critical trees that verify clean immediately', () => {
    for (const rigor of ['standard', 'deep', 'critical'] as const) {
      const files = renderInitTree(plan(rigor, defaultInitPhases(rigor)));
      Vitest.expect(files.some((file) => file.path.endsWith('review-phase/TASK.md'))).toBe(true);
      Vitest.expect(files.some((file) => file.path.endsWith('BOARD.md'))).toBe(true);
      const issues = verifySpecTree({ name: 'ship-login', files }, NO_REVIEW).issues;
      // Execution tasks keep an empty `write-scope:` and warn, so a single-task
      // default tree has no collision error.
      Vitest.expect(issues.filter((issue) => issue.severity === 'error')).toStrictEqual([]);
    }
    // Two independent execution tasks in one phase must not be born colliding.
    const twin = renderInitTree(
      plan('standard', [
        {
          objective: 'One',
          review: 'required',
          tasks: [work('first', 'execution'), work('second', 'execution')],
        },
      ]),
    );
    const twinIssues = verifySpecTree({ name: 'ship-login', files: twin }, NO_REVIEW).issues;
    Vitest.expect(twinIssues.filter((issue) => issue.severity === 'error')).toStrictEqual([]);
    Vitest.expect(codes(twinIssues)).not.toContain('phase.write-scope-overlap');
    Vitest.expect(
      codes(twinIssues).filter((code) => code === 'task.write-scope-missing'),
    ).toHaveLength(2);
  });

  Vitest.it('gives every rigor a valid default plan and the expected phase shape', () => {
    for (const rigor of ['trivial', 'light'] as const) {
      const phases = defaultInitPhases(rigor);
      Vitest.expect(phases).toHaveLength(1);
      Vitest.expect(phases[0]?.review).toBe('waived');
    }
    const standard = defaultInitPhases('standard');
    Vitest.expect(standard).toHaveLength(1);
    Vitest.expect(standard[0]?.review).toBe('required');
    for (const rigor of ['deep', 'critical'] as const) {
      const phases = defaultInitPhases(rigor);
      Vitest.expect(phases).toHaveLength(2);
      Vitest.expect(phases[0]?.tasks[0]?.type).toBe('exploratory');
      Vitest.expect(phases[1]?.tasks[0]?.after).toContain('explore');
    }
    const light = renderInitTree(plan('light', defaultInitPhases('light')));
    Vitest.expect(light.some((file) => file.path.endsWith('BOARD.md'))).toBe(false);
    const critical = renderInitTree(plan('critical', defaultInitPhases('critical')));
    Vitest.expect(critical.some((file) => file.path.endsWith('MAILBOX.md'))).toBe(true);
  });

  Vitest.it('allocates ids per phase from plan order, never caller arithmetic', () => {
    const files = renderInitTree(
      plan('standard', [
        {
          objective: 'One',
          review: 'required',
          tasks: [work('build', 'execution'), work('wire', 'execution')],
        },
        { objective: 'Two', review: 'required', tasks: [work('ship', 'execution', ['build'])] },
      ]),
    );
    const dirs = files.map((file) => file.path).filter((path) => path.endsWith('/TASK.md'));
    Vitest.expect(dirs).toContain('A/A001-build/TASK.md');
    Vitest.expect(dirs).toContain('A/A002-wire/TASK.md');
    Vitest.expect(dirs).toContain('A/A003-review-phase/TASK.md');
    Vitest.expect(dirs).toContain('B/B001-ship/TASK.md');
    Vitest.expect(dirs).toContain('B/B002-review-phase/TASK.md');
    const ship = files.find((file) => file.path === 'B/B001-ship/TASK.md')?.content ?? '';
    Vitest.expect(ship).toContain('depends-on: A001');
  });

  Vitest.it('rejects a deep plan with no exploration phase', () => {
    const issues = validateInitPlan(
      plan('critical', [
        { objective: 'One', review: 'required', tasks: [work('build', 'execution')] },
        { objective: 'Two', review: 'required', tasks: [work('ship', 'execution')] },
      ]),
    );
    Vitest.expect(codes(issues)).toContain(INIT_CODES.explorationMissing);
  });

  Vitest.it('rejects a deep plan whose later phase does not depend on exploration', () => {
    const issues = validateInitPlan(
      plan('critical', [
        { objective: 'One', review: 'required', tasks: [work('explore', 'exploratory')] },
        { objective: 'Two', review: 'required', tasks: [work('ship', 'execution')] },
      ]),
    );
    Vitest.expect(codes(issues)).toContain(INIT_CODES.explorationMissing);
  });

  Vitest.it('accepts only a dependency on the phase A exploration, never a work task', () => {
    const phaseA: InitPhasePlan = {
      objective: 'One',
      review: 'required',
      tasks: [work('explore', 'exploratory'), work('setup', 'execution')],
    };
    const workOnly = validateInitPlan(
      plan('deep', [
        phaseA,
        { objective: 'Two', review: 'required', tasks: [work('build', 'execution', ['setup'])] },
      ]),
    );
    Vitest.expect(codes(workOnly)).toContain(INIT_CODES.explorationMissing);

    const discovery = validateInitPlan(
      plan('deep', [
        phaseA,
        { objective: 'Two', review: 'required', tasks: [work('build', 'execution', ['explore'])] },
      ]),
    );
    Vitest.expect(codes(discovery)).not.toContain(INIT_CODES.explorationMissing);
  });

  Vitest.it('rejects trivial exploration and a prose-only trivial gate', () => {
    const exploration = validateInitPlan(
      plan('trivial', [
        {
          objective: 'One',
          review: 'waived',
          reviewReason: 'x',
          tasks: [work('look', 'exploratory')],
        },
      ]),
    );
    Vitest.expect(codes(exploration)).toContain(INIT_CODES.explorationForbidden);
    const prose = validateInitPlan(
      plan('trivial', [
        {
          objective: 'One',
          review: 'waived',
          reviewReason: 'x',
          tasks: [work('plan', 'planning')],
        },
      ]),
    );
    Vitest.expect(codes(prose)).toContain(INIT_CODES.gateKind);
  });

  Vitest.it('rejects a standard exploration count and placement', () => {
    const count = validateInitPlan(
      plan('standard', [
        {
          objective: 'One',
          review: 'required',
          tasks: [work('one', 'exploratory'), work('two', 'exploratory')],
        },
      ]),
    );
    Vitest.expect(codes(count)).toContain(INIT_CODES.explorationCount);
    const placement = validateInitPlan(
      plan('standard', [
        { objective: 'One', review: 'required', tasks: [work('build', 'execution')] },
        { objective: 'Two', review: 'required', tasks: [work('look', 'exploratory')] },
      ]),
    );
    Vitest.expect(codes(placement)).toContain(INIT_CODES.explorationPlacement);
  });

  Vitest.it('rejects a standard waiver over code work and a review task on a waived phase', () => {
    const waiver = validateInitPlan(
      plan('standard', [
        {
          objective: 'One',
          review: 'waived',
          reviewReason: 'no review',
          tasks: [work('build', 'execution')],
        },
      ]),
    );
    Vitest.expect(codes(waiver)).toContain(INIT_CODES.waiverPolicy);
    const review = validateInitPlan(
      plan('standard', [
        {
          objective: 'One',
          review: 'waived',
          reviewReason: 'no review',
          tasks: [work('build', 'planning'), work('review-phase', 'review')],
        },
      ]),
    );
    Vitest.expect(codes(review)).toContain(INIT_CODES.reviewWaived);
  });

  Vitest.it('rejects duplicate task names and an empty phase', () => {
    const duplicate = validateInitPlan(
      plan('standard', [
        {
          objective: 'One',
          review: 'required',
          tasks: [work('build', 'execution'), work('build', 'execution')],
        },
      ]),
    );
    Vitest.expect(codes(duplicate)).toContain(INIT_CODES.taskDuplicate);
    const empty = validateInitPlan(
      plan('standard', [{ objective: 'One', review: 'required', tasks: [] }]),
    );
    Vitest.expect(empty.length).toBeGreaterThan(0);
  });

  Vitest.it('derives a trivial lock once the task closes and its gate is recorded', () => {
    const files = renderInitTree(plan('trivial', defaultInitPhases('trivial')));
    const taskContent =
      files.find((file) => file.path === 'A/A001-implement/TASK.md')?.content ?? '';
    const gateContent =
      files.find((file) => file.path === 'A/A001-implement/GATES.md')?.content ?? '';
    const command = /^command: (.+)$/m.exec(gateContent)?.[1] ?? '';
    const completeTask = taskContent.replace('status: pending', 'status: complete');
    // SAFETY: map preserves every SpecFileEntry field; only the content changes.
    const withComplete = files.map((file) =>
      file.path === 'A/A001-implement/TASK.md' ? { ...file, content: completeTask } : file,
    ) as ReadonlyArray<SpecFileEntry>;
    const results = JSON.stringify({
      stage: 0,
      title: 'Verification',
      kind: 'mechanical',
      command,
      exit: 0,
      verdict: 'pass',
      at: '2026-11-03T00:00:00Z',
      output: '',
    });
    const withResults = [
      ...withComplete,
      { path: 'A/A001-implement/GATE-RESULTS.jsonl', content: `${results}\n` },
    ];
    const evidence = phaseEvidence({ name: 'ship-login', files: withResults });
    Vitest.expect(evidence.waived).toContain('A');
    Vitest.expect(evidence.proven).toContain('A');
    const tasks = withResults
      .filter((file) => file.path.endsWith('/TASK.md'))
      .map((file) => parseTaskFile(file.content))
      .filter((task) => task !== undefined);
    const analysis = analyze({
      status: 'complete',
      reviewedPhases: [],
      waivedPhases: evidence.waived,
      provenPhases: evidence.proven,
      tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
    });
    Vitest.expect(analysis.phases[0]?.locked).toBe(true);
  });

  Vitest.it('gives a mechanical template a real command and a subjective template a judge', () => {
    Vitest.expect(gateTemplateFor('execution', 'build')).toContain('(mechanical)');
    Vitest.expect(gateTemplateFor('execution', 'build')).toContain('command:');
    Vitest.expect(gateTemplateFor('planning', 'plan')).toContain('(subjective)');
    Vitest.expect(gateTemplateFor('planning', 'plan')).toContain('judge: generic-reviewer');
  });

  Vitest.it('keeps a rendered task parseable by the task contract', () => {
    const files = renderInitTree(plan('standard', defaultInitPhases('standard')));
    const task = files.find((file) => file.path === 'A/A001-implement/TASK.md');
    Vitest.expect(task).toBeDefined();
    const parsed = parseTaskFile(task?.content ?? '');
    Vitest.expect(parsed?.status).toBe('pending');
    Vitest.expect(parsed?.size).toBe('medium');
  });

  Vitest.it('uses taskMarkdown-compatible frontmatter for a generated review task', () => {
    const files = renderInitTree(plan('standard', defaultInitPhases('standard')));
    const review = files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('type: review');
    Vitest.expect(review).toContain('depends-on: A001');
    Vitest.expect(specMarkdown({ name: 'ship-login', version: '2' })).toContain('spec-version: 2');
    Vitest.expect(taskMarkdown({ id: 'A001', name: 'implement' })).toContain('id: A001');
  });

  Vitest.it('rejects review: none where the rigor requires review and reports it on check', () => {
    const reviewFree = plan('standard', [
      { objective: 'One', review: 'none', tasks: [work('build', 'execution')] },
    ]);
    Vitest.expect(codes(validateInitPlan(reviewFree))).toContain(RIGOR_CODES.reviewForbidden);

    const files = renderInitTree(reviewFree);
    const issues = verifySpecTree({ name: 'ship-login', files }, NO_REVIEW).issues;
    Vitest.expect(codes(issues)).toContain(RIGOR_CODES.reviewForbidden);
  });

  Vitest.it('reports an unknown rigor record and an oversized tree on check', () => {
    const withTypo = renderInitTree(plan('standard', defaultInitPhases('standard'))).map((file) =>
      file.path === 'SPEC.md'
        ? { ...file, content: file.content.replace('rigor: standard', 'rigor: Standrad') }
        : file,
    );
    Vitest.expect(
      codes(verifySpecTree({ name: 'ship-login', files: withTypo }, NO_REVIEW).issues),
    ).toContain(RIGOR_CODES.unknownRigor);

    const oversized = renderInitTree(
      plan('trivial', [
        {
          objective: 'One',
          review: 'waived',
          reviewReason: 'gates are the evidence',
          tasks: [work('one', 'execution'), work('two', 'execution'), work('three', 'execution')],
        },
      ]),
    );
    Vitest.expect(
      codes(verifySpecTree({ name: 'ship-login', files: oversized }, NO_REVIEW).issues),
    ).toContain(RIGOR_CODES.ceilingExceeded);
  });
});
