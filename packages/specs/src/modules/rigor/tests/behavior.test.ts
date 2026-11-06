import * as Vitest from '@effect/vitest';

import {
  type InitPhasePlan,
  type InitPlan,
  defaultInitPhases,
  validateInitPlan,
  renderInitTree,
} from '../../init/index.js';
import { RIGOR_CONTRACT, type Rigor, waiverAllowed } from '../index.js';

/**
 * Behavioural tests for the rigor contract: the per-level ceilings, the
 * exploration branches, the waiver policy, and the artifact writer must read
 * the contract row rather than restate it. Each fixture sits exactly at a
 * ceiling and exactly one above it.
 */

const plan = (rigor: Rigor, phases: ReadonlyArray<InitPhasePlan>): InitPlan => ({
  name: 'ship-login',
  rigor,
  author: 'test',
  created: '2026-11-04',
  workspaceType: 'in-place',
  reviewerProfiles: [],
  phases,
});

const execute = (name: string, after: ReadonlyArray<string> = []) => ({
  name,
  type: 'execution' as const,
  size: 'medium' as const,
  after,
});

const explore = (after: ReadonlyArray<string> = []) => ({
  name: 'explore',
  type: 'exploratory' as const,
  size: 'medium' as const,
  after,
});

const REVIEW = {
  trivial: 'waived',
  light: 'waived',
  standard: 'required',
  deep: 'required',
  critical: 'required',
} as const satisfies Record<Rigor, InitPhasePlan['review']>;

/** Build phases with the task types a rigor allows at the given counts. */
const phasesAt = (rigor: Rigor, counts: ReadonlyArray<number>): ReadonlyArray<InitPhasePlan> =>
  counts.map((count, index) => {
    const tasks: Array<InitPhasePlan['tasks'][number]> = [];
    if (index === 0 && (rigor === 'deep' || rigor === 'critical')) {
      tasks.push(explore());
      while (tasks.length < (rigor === 'critical' ? count : Math.min(count, 1))) {
        tasks.push(execute(`explore-${tasks.length}`));
      }
    }
    while (tasks.length < count) {
      if (rigor === 'critical' && index === 0) tasks.push(explore());
      else
        tasks.push(
          execute(
            `${index}-${tasks.length}`,
            index === 0 || (rigor !== 'deep' && rigor !== 'critical') ? [] : ['explore'],
          ),
        );
    }
    const phase: InitPhasePlan = {
      objective: `Phase ${index + 1}`,
      review: REVIEW[rigor],
      tasks,
    };
    return REVIEW[rigor] === 'waived'
      ? { ...phase, reviewReason: 'gates are the evidence' }
      : phase;
  });

const codes = (issues: ReadonlyArray<{ code?: string }>) => issues.map((issue) => issue.code);

/** Ceilings at the maximum and one above, for every level. */
const CEILINGS: ReadonlyArray<{
  readonly rigor: Rigor;
  readonly atMax: ReadonlyArray<number>;
  readonly overTasks: ReadonlyArray<number>;
  readonly overPhase: ReadonlyArray<number>;
  readonly overPhases: ReadonlyArray<number>;
}> = [
  { rigor: 'trivial', atMax: [2], overTasks: [3], overPhase: [3], overPhases: [1, 1] },
  { rigor: 'light', atMax: [4], overTasks: [5], overPhase: [5], overPhases: [1, 1] },
  { rigor: 'standard', atMax: [4, 2], overTasks: [4, 3], overPhase: [5, 1], overPhases: [1, 1, 1] },
  {
    rigor: 'deep',
    atMax: [5, 4],
    overTasks: [5, 5],
    overPhase: [6, 2, 1],
    overPhases: [1, 1, 1, 1],
  },
  {
    rigor: 'critical',
    atMax: [1, 6, 5],
    overTasks: [1, 6, 6],
    overPhase: [1, 7, 1],
    overPhases: [1, 1, 1, 1, 1],
  },
];

Vitest.describe('Rigor.behaviour runtime', () => {
  Vitest.it('accepts every level at its ceiling and rejects one past each ceiling', () => {
    for (const entry of CEILINGS) {
      const atMax = validateInitPlan(plan(entry.rigor, phasesAt(entry.rigor, entry.atMax)));
      Vitest.expect(atMax, entry.rigor).toStrictEqual([]);

      for (const counts of [entry.overTasks, entry.overPhase, entry.overPhases]) {
        const issues = validateInitPlan(plan(entry.rigor, phasesAt(entry.rigor, counts)));
        Vitest.expect(
          codes(issues).some((code) => code === 'init.phase-count' || code === 'init.task-ceiling'),
          `${entry.rigor} ${counts.join(',')}`,
        ).toBe(true);
      }
    }
  });

  Vitest.it('rejects the deep two-exploration cap and the critical dedicated phase A', () => {
    const deep = validateInitPlan(
      plan('deep', [
        { objective: 'Explore', review: 'required', tasks: [explore(), explore()] },
        { objective: 'Build', review: 'required', tasks: [execute('ship', ['explore'])] },
      ]),
    );
    Vitest.expect(codes(deep)).toContain('init.exploration-count');

    const critical = validateInitPlan(
      plan('critical', [
        { objective: 'Explore', review: 'required', tasks: [explore(), execute('build')] },
        { objective: 'Ship', review: 'required', tasks: [execute('ship', ['explore'])] },
      ]),
    );
    Vitest.expect(codes(critical)).toContain('init.exploration-placement');
    Vitest.expect(codes(critical)).not.toContain('init.exploration-forbidden');
  });

  Vitest.it('keeps a light exploratory task out of phase B', () => {
    const issues = validateInitPlan(
      plan('light', [
        { objective: 'One', review: 'waived', reviewReason: 'gates', tasks: [execute('build')] },
        {
          objective: 'Two',
          review: 'waived',
          reviewReason: 'gates',
          tasks: [explore()],
        },
      ]),
    );
    Vitest.expect(codes(issues)).toContain('init.exploration-placement');
  });

  Vitest.it('derives waiverAllowed from the contract waiver policy', () => {
    const recordWork = ['execution', 'defect', 'interruptor'];
    const recordOnly = ['planning', 'exploratory', 'review'];
    for (const type of [...recordWork, ...recordOnly]) {
      Vitest.expect(waiverAllowed('trivial', [type]), `trivial ${type}`).toBe(true);
      Vitest.expect(waiverAllowed('light', [type]), `light ${type}`).toBe(true);
      Vitest.expect(waiverAllowed('critical', [type]), `critical ${type}`).toBe(false);
    }
    for (const type of recordWork) {
      Vitest.expect(waiverAllowed('standard', [type]), `standard ${type}`).toBe(false);
      Vitest.expect(waiverAllowed('deep', [type]), `deep ${type}`).toBe(false);
    }
    for (const type of recordOnly) {
      Vitest.expect(waiverAllowed('standard', [type]), `standard ${type}`).toBe(true);
      Vitest.expect(waiverAllowed('deep', [type]), `deep ${type}`).toBe(true);
    }
  });

  Vitest.it('changes the waiver verb when the contract waiver field flips', () => {
    const before = RIGOR_CONTRACT.deep.waiver;
    try {
      Reflect.set(RIGOR_CONTRACT.deep, 'waiver', 'forbidden');
      Vitest.expect(waiverAllowed('deep', ['planning'])).toBe(false);
    } finally {
      Reflect.set(RIGOR_CONTRACT.deep, 'waiver', before);
    }
    Vitest.expect(waiverAllowed('deep', ['planning'])).toBe(true);
  });

  Vitest.it('changes the generator artifacts when the contract artifact fields flip', () => {
    const deepBefore = [...RIGOR_CONTRACT.deep.artifacts];
    try {
      Reflect.set(
        RIGOR_CONTRACT.deep,
        'artifacts',
        deepBefore.filter((artifact) => artifact !== 'BOARD.md'),
      );
      const files = renderInitTree(plan('deep', defaultInitPhases('deep')));
      Vitest.expect(files.some((file) => file.path.endsWith('BOARD.md'))).toBe(false);
    } finally {
      Reflect.set(RIGOR_CONTRACT.deep, 'artifacts', deepBefore);
    }
    Vitest.expect(
      renderInitTree(plan('deep', defaultInitPhases('deep'))).some((file) =>
        file.path.endsWith('BOARD.md'),
      ),
    ).toBe(true);

    const lightPlan = plan('light', [
      {
        objective: 'One',
        review: 'waived',
        reviewReason: 'gates are the evidence',
        tasks: [execute('first'), execute('second')],
      },
    ]);
    Vitest.expect(renderInitTree(lightPlan).some((file) => file.path.endsWith('BOARD.md'))).toBe(
      true,
    );
    const lightBefore = [...RIGOR_CONTRACT.light.conditionalArtifacts];
    try {
      Reflect.set(
        RIGOR_CONTRACT.light,
        'conditionalArtifacts',
        lightBefore.filter((artifact) => artifact !== 'BOARD.md'),
      );
      Vitest.expect(renderInitTree(lightPlan).some((file) => file.path.endsWith('BOARD.md'))).toBe(
        false,
      );
    } finally {
      Reflect.set(RIGOR_CONTRACT.light, 'conditionalArtifacts', lightBefore);
    }
  });
});
