import type { FeatureStatus } from '../feature/index.js';
import { type TaskStatus, phaseOf, phaseRank } from '../task/index.js';
import { type Issue, type Result, issue } from '../verify/index.js';

/** Derived lifecycle state of a feature. */
export const STATES = [
  'not-started',
  'in-progress',
  'blocked',
  'complete',
  'inconsistent',
] as const;

/** Derived lifecycle state of a feature. */
export type State = (typeof STATES)[number];

/** One task reduced to the fields lifecycle reasoning needs. */
export interface TaskEntry {
  readonly id: string;
  readonly status: TaskStatus;
}

/** Input for {@link analyze} / {@link verify}: feature header + tasks. */
export interface Input {
  /** FEATURE.md `status`. */
  readonly status: FeatureStatus;
  /** FEATURE.md `locked-phases`. */
  readonly lockedPhases: ReadonlyArray<string>;
  /** Parsed tasks (tasks whose TASK.md failed to parse are excluded). */
  readonly tasks: ReadonlyArray<TaskEntry>;
}

/** Per-phase roll-up used by the status panel. */
export interface PhaseSummary {
  readonly phase: string;
  readonly locked: boolean;
  readonly total: number;
  readonly complete: number;
}

/** Full lifecycle analysis of one feature. */
export interface Analysis {
  readonly state: State;
  readonly total: number;
  readonly counts: Readonly<Record<TaskStatus, number>>;
  readonly phases: ReadonlyArray<PhaseSummary>;
  readonly issues: ReadonlyArray<Issue>;
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

const distinctPhases = (tasks: ReadonlyArray<TaskEntry>): ReadonlyArray<string> =>
  [...new Set(tasks.map((task) => phaseOf(task.id)))].toSorted(
    (a, b) => phaseRank(a) - phaseRank(b),
  );

const countByStatus = (tasks: ReadonlyArray<TaskEntry>) => {
  const counts = { pending: 0, 'in-progress': 0, complete: 0, blocked: 0 };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
};

const phaseSummaries = (
  tasks: ReadonlyArray<TaskEntry>,
  locked: ReadonlySet<string>,
): ReadonlyArray<PhaseSummary> =>
  distinctPhases(tasks).map((phase) => {
    const inPhase = tasks.filter((task) => phaseOf(task.id) === phase);
    return {
      phase,
      locked: locked.has(phase),
      total: inPhase.length,
      complete: inPhase.filter((task) => task.status === 'complete').length,
    };
  });

/**
 * Verify the feature lifecycle holds together: `complete` requires every
 * task complete and every phase locked; all-complete + all-locked requires
 * `complete`; locked phases must be fully complete; and locked phases must
 * form a prefix (no forward locking). Pure — no IO.
 * @param input - feature header plus parsed tasks
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (input: Input): Result => {
  const issues: Array<Issue> = [];
  const phases = distinctPhases(input.tasks);
  const locked = new Set(input.lockedPhases);
  const allComplete =
    input.tasks.length > 0 && input.tasks.every((task) => task.status === 'complete');
  const allPhasesLocked = phases.length > 0 && phases.every((phase) => locked.has(phase));

  if (input.status === 'complete') {
    const open = input.tasks.filter((task) => task.status !== 'complete');
    if (open.length > 0) {
      issues.push(
        issue(
          'status',
          `Feature status is 'complete' but ${open.length} ${plural(open.length, 'task is', 'tasks are')} not complete: ${open.map((task) => `${task.id} (${task.status})`).join(', ')}.`,
        ),
      );
    }
    const unlocked = phases.filter((phase) => !locked.has(phase));
    if (unlocked.length > 0) {
      issues.push(
        issue(
          'locked-phases',
          `Feature status is 'complete' but ${plural(unlocked.length, 'phase', 'phases')} ${unlocked.join(', ')} ${plural(unlocked.length, 'is', 'are')} not locked.`,
        ),
      );
    }
  } else if (allComplete && allPhasesLocked) {
    issues.push(
      issue(
        'status',
        "All tasks are complete and all phases are locked, but feature status is 'in-progress'.",
      ),
    );
  }

  for (const phase of phases) {
    if (!locked.has(phase)) continue;
    const open = input.tasks.filter(
      (task) => phaseOf(task.id) === phase && task.status !== 'complete',
    );
    if (open.length > 0) {
      issues.push(
        issue(
          'locked-phases',
          `Phase '${phase}' is locked but ${plural(open.length, 'task', 'tasks')} ${open.map((task) => `${task.id} (${task.status})`).join(', ')} ${plural(open.length, 'is', 'are')} not complete.`,
        ),
      );
    }
  }

  let sawUnlocked = false;
  for (const phase of phases) {
    if (locked.has(phase)) {
      if (sawUnlocked) {
        issues.push(
          issue('locked-phases', `Phase '${phase}' is locked but an earlier phase is not.`),
        );
      }
    } else {
      sawUnlocked = true;
    }
  }

  return { valid: issues.length === 0, issues };
};

/**
 * Derive the feature's lifecycle state and roll up task counts per phase.
 * `inconsistent` means {@link verify} found a bookkeeping contradiction.
 * @param input - feature header plus parsed tasks
 * @returns the analysis, including the state and any issues
 */
export const analyze = (input: Input): Analysis => {
  const result = verify(input);
  const counts = countByStatus(input.tasks);
  const locked = new Set(input.lockedPhases);
  const phases = phaseSummaries(input.tasks, locked);
  const allComplete =
    input.tasks.length > 0 && input.tasks.every((task) => task.status === 'complete');
  const allPhasesLocked = phases.length > 0 && phases.every((phase) => phase.locked);
  const anyStarted = input.tasks.some((task) => task.status !== 'pending');
  const anyInProgress = input.tasks.some((task) => task.status === 'in-progress');
  const anyBlocked = input.tasks.some((task) => task.status === 'blocked');

  const state: State = !result.valid
    ? 'inconsistent'
    : input.status === 'complete' && allComplete && allPhasesLocked
      ? 'complete'
      : !anyStarted
        ? 'not-started'
        : anyBlocked && !anyInProgress
          ? 'blocked'
          : 'in-progress';

  return { state, total: input.tasks.length, counts, phases, issues: result.issues };
};
