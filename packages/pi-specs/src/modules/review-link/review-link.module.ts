import { phaseOf, phaseRank } from '../task/index.js';
import { type Issue, type Result, issue, noErrors } from '../verify/index.js';

/**
 * The convention linking a spec's per-phase review tasks to its review
 * series. A spec named `<name>` owns the review series `<name>` under
 * `.agents/@montflow/reviews/<name>/`; the phase whose rank is N is reviewed
 * in round `NNN` (phase `A` → `001`, phase `B` → `002`, …). The mapping is
 * derived, never hand-typed, so a phase cannot drift from its round.
 *
 * The module is pure: the caller supplies the review series' round directory
 * names (as the `mf-reviews` store sees them) and never touches disk here.
 */

/** One task reduced to the fields the link needs. */
export interface TaskEntry {
  /** Task id, e.g. `A099`. */
  readonly id: string;
  /** Canonical task type, e.g. `review`. */
  readonly type: string;
}

/** The review series a spec is linked to, as the review store sees it. */
export interface SeriesSnapshot {
  /** Series directory name (the convention is the spec name). */
  readonly name: string;
  /** Round directory names under the series, e.g. `['001', '002']`. */
  readonly rounds: ReadonlyArray<string>;
}

/**
 * The review series name for a spec. The convention is identity — a spec
 * named `ship-login` is reviewed as series `ship-login`.
 * @param specName - spec directory slug
 * @returns the review series name
 */
export const seriesName = (specName: string): string => specName;

/**
 * The round directory a phase is reviewed in: the phase's rank, zero-padded
 * to three digits (phase `A` → `001`, `AA` → `027`).
 * @param phase - phase id, e.g. `A`
 * @returns the three-digit round directory name
 */
export const roundForPhase = (phase: string): string => String(phaseRank(phase)).padStart(3, '0');

/**
 * The phases carrying a `review` task, phase-sorted. A spec phase is
 * expected to hold exactly one review task; duplicates collapse here and are
 * the structure verifier's concern, not the link's.
 * @param tasks - parsed tasks
 * @returns the distinct review phases, in phase order
 */
export const reviewPhases = (tasks: ReadonlyArray<TaskEntry>): ReadonlyArray<string> =>
  [
    ...new Set(tasks.filter((task) => task.type === 'review').map((task) => phaseOf(task.id))),
  ].toSorted((a, b) => phaseRank(a) - phaseRank(b));

/**
 * Verify the spec's review tasks against its review series: every review
 * phase must have the round the convention assigns to it, and the series
 * name must match the spec. A missing series reads as every review round
 * absent. Pure — no IO.
 * @param specName - spec directory slug
 * @param tasks - parsed tasks of the spec
 * @param series - the review series rounds, or undefined when no series exists
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (
  specName: string,
  tasks: ReadonlyArray<TaskEntry>,
  series: SeriesSnapshot | undefined,
): Result => {
  const issues: Array<Issue> = [];
  const expected = seriesName(specName);

  if (series !== undefined && series.name !== expected) {
    issues.push(
      issue(
        'review-series',
        `Review series is '${series.name}' but the convention names it '${expected}'.`,
      ),
    );
  }

  const present = new Set(series?.rounds ?? []);
  for (const phase of reviewPhases(tasks)) {
    const round = roundForPhase(phase);
    if (!present.has(round)) {
      issues.push(
        issue(
          `phase ${phase}`,
          series === undefined
            ? `Phase '${phase}' has a review task but review series '${expected}' does not exist; create round ${round}.`
            : `Phase '${phase}' has a review task but series '${expected}' has no round ${round}.`,
        ),
      );
    }
  }

  return { valid: noErrors(issues), issues };
};
