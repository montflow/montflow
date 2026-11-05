import { type Task, phaseOf, phaseRank } from '../task/index.js';
import { type Issue, finding } from '../verify/index.js';

/**
 * The dependency-integrity rules: every `depends-on` edge resolves to a real
 * task, points at the same or an earlier phase, stays acyclic, and never forms
 * the implicit contradictions — a non-review task reaching its own phase's
 * review, or a complete task waiting on an unfinished one. `related-tasks`
 * resolves here too, as a cross-reference with no scheduling effect.
 */

/** Stable code for a `depends-on` target with no task directory. */
export const DEPENDS_ON_UNKNOWN_CODE = 'depends-on.unknown-target';

/** Stable code for a `depends-on` edge to the task itself. */
export const DEPENDS_ON_SELF_CODE = 'depends-on.self-reference';

/** Stable code for a `depends-on` edge to a later phase. */
export const DEPENDS_ON_FORWARD_CODE = 'depends-on.forward-phase';

/** Stable code for a `depends-on` cycle. */
export const DEPENDS_ON_CYCLE_CODE = 'depends-on.cycle';

/** Stable code for a non-review task that reaches its own phase's review task. */
export const DEPENDS_ON_OWN_PHASE_REVIEW_CODE = 'depends-on.own-phase-review';

/** Stable code for a complete task whose `depends-on` target is not complete. */
export const DEPENDS_ON_COMPLETE_CODE = 'depends-on.complete-before-target';

/** Stable code for a `related-tasks` id with no task directory. */
export const RELATED_TASKS_UNKNOWN_CODE = 'related-tasks.unknown-target';

/** Stable code for a `related-tasks` edge to the task itself. */
export const RELATED_TASKS_SELF_CODE = 'related-tasks.self-reference';

/**
 * Find the first `depends-on` cycle, if any. Returns the offending ids in
 * cycle order (the repeated id closes the cycle).
 */
const findCycle = (tasks: ReadonlyMap<string, Task>): ReadonlyArray<string> | undefined => {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: Array<string> = [];
  let cycle: Array<string> | undefined;

  const visit = (id: string): void => {
    if (cycle !== undefined) return;
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      cycle = stack.slice(stack.indexOf(id)).concat(id);
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    const task = tasks.get(id);
    if (task !== undefined) {
      for (const dep of task.dependsOn) visit(dep);
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of tasks.keys()) visit(id);
  return cycle;
};

/**
 * Find the shortest `depends-on` path from a non-review task to a review task
 * in its own phase. Only same-phase ids are traversed, so a dependency on an
 * earlier phase's review task stays valid. Returns the full chain (source
 * first, review last), or undefined when no such path exists.
 */
const ownPhaseReviewPath = (
  source: Task,
  tasks: ReadonlyMap<string, Task>,
): ReadonlyArray<string> | undefined => {
  if (source.type === 'review') return undefined;
  const phase = phaseOf(source.id);
  const queue: Array<ReadonlyArray<string>> = [[source.id]];
  const visited = new Set<string>([source.id]);
  while (queue.length > 0) {
    const path = queue.shift();
    if (path === undefined) break;
    const current = tasks.get(path[path.length - 1] ?? '');
    if (current === undefined) continue;
    for (const dep of current.dependsOn) {
      const target = tasks.get(dep);
      if (target === undefined) continue;
      if (target.type === 'review' && phaseOf(dep) === phase) return [...path, dep];
      if (phaseOf(dep) !== phase || visited.has(dep)) continue;
      visited.add(dep);
      queue.push([...path, dep]);
    }
  }
  return undefined;
};

/**
 * Verify every dependency and relation in a parsed task set. Pure — the caller
 * supplies the map; no file is read.
 * @param tasks - every parsed task in the spec, keyed by id
 * @returns the findings, in task-id order
 */
export const verifyDependencies = (tasks: ReadonlyMap<string, Task>): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];

  for (const [id, task] of tasks) {
    for (const dep of task.dependsOn) {
      const depTask = tasks.get(dep);
      if (depTask === undefined) {
        issues.push(
          finding({
            code: DEPENDS_ON_UNKNOWN_CODE,
            field: `task ${id}`,
            message: `depends-on '${dep}' has no task directory.`,
            expected: 'a task id in this spec',
            actual: `${dep} not found`,
            fix: `Remove '${dep}' from 'depends-on:', or create that task.`,
          }),
        );
        continue;
      }
      if (dep === id) {
        issues.push(
          finding({
            code: DEPENDS_ON_SELF_CODE,
            field: `task ${id}`,
            message: 'depends-on must not reference the task itself.',
            expected: `a task id other than '${id}'`,
            actual: id,
            fix: `Remove '${id}' from 'depends-on:'.`,
          }),
        );
        continue;
      }
      if (phaseRank(phaseOf(dep)) > phaseRank(phaseOf(id))) {
        issues.push(
          finding({
            code: DEPENDS_ON_FORWARD_CODE,
            field: `task ${id}`,
            message: `depends-on '${dep}' points to a later phase.`,
            expected: 'a same-phase or earlier-phase task',
            actual: `${dep} in phase ${phaseOf(dep)}`,
            fix: `Remove the edge to '${dep}', or move the dependency into an earlier phase.`,
          }),
        );
      }
    }

    const reviewPath = ownPhaseReviewPath(task, tasks);
    if (reviewPath !== undefined) {
      const reviewId = reviewPath[reviewPath.length - 1] ?? '';
      const next = reviewPath[1] ?? reviewId;
      const through = reviewPath.length > 2 ? ` through ${reviewPath.slice(1).join(' -> ')}` : '';
      issues.push(
        finding({
          code: DEPENDS_ON_OWN_PHASE_REVIEW_CODE,
          field: `task ${id}`,
          message: `Task '${id}' depends on its own phase's review task '${reviewId}'${through}; the review waits on every non-review task, so phase '${phaseOf(id)}' can never be ready.`,
          expected: `the review edge to run from '${reviewId}' to its phase's work, never the reverse`,
          actual: reviewPath.join(' -> '),
          fix: `Remove the 'depends-on' edge to '${next}'; a review task may depend on its phase's work, never the reverse.`,
        }),
      );
    }

    if (task.status === 'complete') {
      // The ready set never dispatches ahead of a dependency, so a complete
      // dependent with an unfinished target is a false history. An unknown
      // target already failed above and is never counted twice.
      for (const dep of task.dependsOn) {
        const depTask = tasks.get(dep);
        if (depTask === undefined || depTask.status === 'complete') continue;
        issues.push(
          finding({
            code: DEPENDS_ON_COMPLETE_CODE,
            field: `task ${id}`,
            message: `Task '${id}' is complete but its depends-on target '${dep}' is '${depTask.status}'; a task cannot complete ahead of a dependency.`,
            expected: 'a complete depends-on target',
            actual: `${dep} is ${depTask.status}`,
            fix: `Complete '${dep}' and prove its gate, or set '${id}' back to 'in-progress' until '${dep}' completes.`,
          }),
        );
      }
    }

    for (const related of task.relatedTasks) {
      if (related === id) {
        issues.push(
          finding({
            code: RELATED_TASKS_SELF_CODE,
            field: `task ${id}`,
            message: 'related-tasks must not reference the task itself.',
            expected: `a task id other than '${id}'`,
            actual: id,
            fix: `Remove '${id}' from 'related-tasks:'.`,
          }),
        );
        continue;
      }
      if (!tasks.has(related)) {
        issues.push(
          finding({
            code: RELATED_TASKS_UNKNOWN_CODE,
            field: `task ${id}`,
            message: `related-tasks '${related}' has no task directory.`,
            expected: 'a task id in this spec',
            actual: `${related} not found`,
            fix: `Remove '${related}' from 'related-tasks:', or create that task; a relation is a cross-reference, never a scheduling edge.`,
          }),
        );
      }
    }
  }

  const cycle = findCycle(tasks);
  if (cycle !== undefined) {
    const first = cycle[0] ?? '';
    const second = cycle[1] ?? '';
    issues.push(
      finding({
        code: DEPENDS_ON_CYCLE_CODE,
        field: 'depends-on',
        message: `Dependency cycle: ${cycle.join(' -> ')}.`,
        expected: 'an acyclic dependency graph',
        actual: cycle.join(' -> '),
        fix: `Remove the 'depends-on' edge from '${first}' to '${second}'.`,
      }),
    );
  }

  return issues;
};
