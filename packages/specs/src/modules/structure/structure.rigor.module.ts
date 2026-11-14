import { declaredRigorOfSpec, rigorOfSpec } from '../creation/index.js';
import { explorationIssues, phaseDependencyIssues } from '../init/index.js';
import { CODES as RIGOR_CODES, RIGOR_CONTRACT, RIGOR_HINT } from '../rigor/index.js';
import type { Task } from '../task/index.js';
import { phaseOf, phaseRank } from '../task/index.js';
import { type Issue, finding } from '../verify/index.js';

/**
 * Verify a v2 tree against the rigor it records: an unrecognised value is a
 * finding rather than a silent disable, and a tree past the phase, total-task,
 * or per-phase ceiling is reported even when it was grown after `init`.
 * @param input - the SPEC.md text, phase directories, and parsed tasks
 * @returns every rigor finding
 */
export const verifyRigorCeilings = (input: {
  readonly specText: string;
  readonly phaseDirs: ReadonlyArray<string>;
  readonly tasks: ReadonlyMap<string, Task>;
}): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const rigor = rigorOfSpec(input.specText);
  const declared = declaredRigorOfSpec(input.specText);
  if (rigor === undefined && declared !== undefined) {
    issues.push(
      finding({
        code: RIGOR_CODES.unknownRigor,
        field: 'SPEC.md: rigor',
        message: `The creation record names unknown rigor '${declared}'; no rigor rule is enforced.`,
        expected: RIGOR_HINT,
        actual: declared,
        fix: 'Correct the `- rigor:` line in the SPEC.md `## Creation` section to one of the five levels.',
      }),
    );
    return issues;
  }
  if (rigor === undefined) return issues;

  const contract = RIGOR_CONTRACT[rigor];
  const work = Array.from(input.tasks.values()).filter((task) => task.type !== 'review');
  if (input.phaseDirs.length > contract.maxPhases) {
    issues.push(
      finding({
        code: RIGOR_CODES.ceilingExceeded,
        field: 'phases',
        message: `A ${rigor} spec allows ${contract.maxPhases} phases; this tree holds ${input.phaseDirs.length}.`,
        expected: `at most ${contract.maxPhases} phases`,
        actual: String(input.phaseDirs.length),
        fix: 'Move the extra work into a new spec, or re-appraise the rigor with the user.',
      }),
    );
  }
  if (work.length > contract.maxTasks) {
    issues.push(
      finding({
        code: RIGOR_CODES.ceilingExceeded,
        field: 'tasks',
        message: `A ${rigor} spec allows ${contract.maxTasks} work tasks; this tree holds ${work.length}.`,
        expected: `at most ${contract.maxTasks} work tasks`,
        actual: String(work.length),
        fix: 'Move the extra work into a new spec, or re-appraise the rigor with the user.',
      }),
    );
  }
  for (const phase of input.phaseDirs) {
    const count = work.filter((task) => phaseOf(task.id) === phase).length;
    if (count > contract.maxTasksPerPhase) {
      issues.push(
        finding({
          code: RIGOR_CODES.ceilingExceeded,
          field: `phase ${phase}`,
          message: `A ${rigor} phase allows ${contract.maxTasksPerPhase} work tasks; phase '${phase}' holds ${count}.`,
          expected: `at most ${contract.maxTasksPerPhase} work tasks per phase`,
          actual: String(count),
          fix: 'Split the phase, move the work into another phase, or re-appraise the rigor with the user.',
        }),
      );
    }
  }

  // Exploration placement and the deep/critical dependency on phase A hold on
  // the live tree too, so a phase or task grown past the rule fails `check`.
  const phases = [...input.phaseDirs].toSorted((a, b) => phaseRank(a) - phaseRank(b));
  const tasksByPhase = new Map<string, Array<Task>>();
  for (const task of input.tasks.values()) {
    const phase = phaseOf(task.id);
    const bucket = tasksByPhase.get(phase) ?? [];
    bucket.push(task);
    tasksByPhase.set(phase, bucket);
  }
  const graph = phases.map((phase, index) => ({
    id: phase,
    tasks: (tasksByPhase.get(phase) ?? []).map((task) => ({
      id: task.id,
      type: task.type,
      phaseIndex: index,
      dependsOn: task.dependsOn,
    })),
  }));
  issues.push(
    ...explorationIssues(
      rigor,
      phases.map((phase) => (tasksByPhase.get(phase) ?? []).map((task) => task.type)),
    ),
    ...phaseDependencyIssues(rigor, graph),
  );
  return issues;
};
