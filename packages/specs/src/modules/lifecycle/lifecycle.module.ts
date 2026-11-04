import type { SpecStatus } from '../spec/index.js';
import { type TaskStatus, phaseOf, phaseRank } from '../task/index.js';
import { type Issue, type Result, issue, noErrors } from '../verify/index.js';

/**
 * Derived lifecycle state of a spec. `pending` is idle work (not
 * complete, no live session bound to it); `in-progress` means a live session is
 * actively working on it; `blocked` is idle work with blocked tasks and
 * nothing in progress.
 */
export const STATES = ['pending', 'in-progress', 'blocked', 'complete', 'inconsistent'] as const;

/** Derived lifecycle state of a spec. */
export type State = (typeof STATES)[number];

/** One task reduced to the fields lifecycle reasoning needs. */
export interface TaskEntry {
  readonly id: string;
  readonly status: TaskStatus;
}

/** Input for {@link analyze} / {@link verify}: spec header + tasks. */
export interface Input {
  /** SPEC.md `status`. */
  readonly status: SpecStatus;
  /**
   * Phases with a passed review round attributed to them, as the review store
   * supplies them. Locks are derived from this plus full task completion; there
   * is no stored lock list.
   */
  readonly reviewedPhases: ReadonlyArray<string>;
  /** Phases with an effective `PHASE.md` waiver. */
  readonly waivedPhases: ReadonlyArray<string>;
  /** Phases that declare `review: none` and hold no review task. */
  readonly nonePhases?: ReadonlyArray<string> | undefined;
  /** Phases whose classified mechanical gate stages all have a latest pass. */
  readonly provenPhases: ReadonlyArray<string>;
  /** Parsed tasks (tasks whose TASK.md failed to parse are excluded). */
  readonly tasks: ReadonlyArray<TaskEntry>;
  /**
   * True when a v2 spec's `complete` status must agree with its derived locks.
   * A frozen v1 record keeps the status-only rule it shipped with.
   */
  readonly requireLocks?: boolean | undefined;
  /**
   * True when a live session is bound to this spec. Supplied by the caller
   * (the sessions store), never derived from the spec files. Drives the
   * `pending` vs `in-progress` distinction.
   */
  readonly active?: boolean | undefined;
}

/** Per-phase roll-up used by the status panel. */
export interface PhaseSummary {
  readonly phase: string;
  readonly locked: boolean;
  readonly total: number;
  readonly complete: number;
}

/** Full lifecycle analysis of one spec. */
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

/**
 * A phase is complete when every task under it is complete. It is locked when
 * it is complete, every classified mechanical gate stage is proven, and it has
 * a passed review round, an effective waiver, or no review at all. The
 * conjunction is the whole lock model — a locked phase can never hold open work
 * or unproven gates.
 */
const phaseSummaries = (
  tasks: ReadonlyArray<TaskEntry>,
  reviewed: ReadonlySet<string>,
  waived: ReadonlySet<string>,
  none: ReadonlySet<string>,
  proven: ReadonlySet<string>,
): ReadonlyArray<PhaseSummary> =>
  distinctPhases(tasks).map((phase) => {
    const inPhase = tasks.filter((task) => phaseOf(task.id) === phase);
    const complete = inPhase.filter((task) => task.status === 'complete').length;
    return {
      phase,
      locked:
        complete === inPhase.length &&
        proven.has(phase) &&
        (reviewed.has(phase) || waived.has(phase) || none.has(phase)),
      total: inPhase.length,
      complete,
    };
  });

/**
 * Verify the spec lifecycle holds together: `complete` requires every task
 * complete, and an all-complete spec must declare `complete`. Locks are derived
 * (complete plus a passed round) and a locked phase cannot hold open work by
 * construction, so there is no stored lock list to contradict. Pure — no IO.
 * @param input - spec header plus parsed tasks
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (input: Input): Result => {
  const issues: Array<Issue> = [];
  const allComplete =
    input.tasks.length > 0 && input.tasks.every((task) => task.status === 'complete');

  if (input.status === 'complete') {
    const open = input.tasks.filter((task) => task.status !== 'complete');
    if (open.length > 0) {
      issues.push(
        issue(
          'status',
          `Spec status is 'complete' but ${open.length} ${plural(open.length, 'task is', 'tasks are')} not complete: ${open.map((task) => `${task.id} (${task.status})`).join(', ')}.`,
        ),
      );
    }
    if (input.requireLocks === true) {
      const unlocked = phaseSummaries(
        input.tasks,
        new Set(input.reviewedPhases),
        new Set(input.waivedPhases),
        new Set(input.nonePhases ?? []),
        new Set(input.provenPhases),
      ).filter((phase) => !phase.locked);
      if (unlocked.length > 0) {
        issues.push(
          issue(
            'status',
            `Spec status is 'complete' but ${unlocked.length} ${plural(unlocked.length, 'phase is', 'phases are')} not locked: ${unlocked.map((phase) => `${phase.phase} (${phase.complete}/${phase.total} complete)`).join(', ')}.`,
            "Finish the phase's gates and close its review round, or fix its waiver.",
          ),
        );
      }
    }
  } else if (allComplete) {
    issues.push(issue('status', "All tasks are complete, but spec status is 'in-progress'."));
  }

  return { valid: noErrors(issues), issues };
};

/**
 * Derive the spec's lifecycle state and roll up task counts per phase.
 * `inconsistent` means {@link verify} found a bookkeeping contradiction;
 * `in-progress` means a live session is bound (`active`), otherwise unfinished
 * work reads as `pending` (idle) or `blocked`.
 * @param input - spec header plus parsed tasks
 * @returns the analysis, including the state and any issues
 */
export const analyze = (input: Input): Analysis => {
  const result = verify(input);
  const counts = countByStatus(input.tasks);
  const reviewed = new Set(input.reviewedPhases);
  const waived = new Set(input.waivedPhases);
  const none = new Set(input.nonePhases ?? []);
  const proven = new Set(input.provenPhases);
  const phases = phaseSummaries(input.tasks, reviewed, waived, none, proven);
  const allComplete =
    input.tasks.length > 0 && input.tasks.every((task) => task.status === 'complete');
  const anyInProgress = input.tasks.some((task) => task.status === 'in-progress');
  const anyBlocked = input.tasks.some((task) => task.status === 'blocked');
  const active = input.active === true;

  const state: State = !result.valid
    ? 'inconsistent'
    : input.status === 'complete' && allComplete
      ? 'complete'
      : active
        ? 'in-progress'
        : anyBlocked && !anyInProgress
          ? 'blocked'
          : 'pending';

  return { state, total: input.tasks.length, counts, phases, issues: result.issues };
};
