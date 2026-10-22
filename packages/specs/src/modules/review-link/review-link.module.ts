import { phaseOf, phaseRank } from '../task/index.js';
import { type Issue, type Result, issue, noErrors } from '../verify/index.js';

/**
 * The convention linking a spec's per-phase review tasks to its review
 * series. A spec named `<name>` owns the review series `<name>`; each
 * declared reviewer profile adds one series `<name>-<profile>`. A completed
 * phase's review lands on one round attributed to that phase (`- Phase: <ph>`)
 * in every expected series, at the same round number.
 *
 * The mapping is derived, never hand-typed, so a phase cannot drift from its
 * round. The module is pure: the caller supplies the review series' rounds and
 * their phase attribution (as the review store sees them); it never touches
 * disk here.
 */

/** One task reduced to the fields the link needs. */
export interface TaskEntry {
  /** Task id, e.g. `A099`. */
  readonly id: string;
  /** Canonical task type, e.g. `review`. */
  readonly type: string;
}

/** One round of a review series, with the phase it reviews when attributed. */
export interface SeriesRoundSnapshot {
  /** Round directory name, e.g. `001`. */
  readonly round: string;
  /** The phase the round reviews, from its `- Phase:` metadata, when set. */
  readonly phase?: string | undefined;
}

/** The review series a spec is linked to, as the review store sees it. */
export interface SeriesSnapshot {
  /** Series directory name (`<spec>` or `<spec>-<profile>`). */
  readonly name: string;
  /** The series' rounds, each carrying its phase attribution when set. */
  readonly rounds: ReadonlyArray<SeriesRoundSnapshot>;
}

/** One `review` task reduced to the fields the link needs. */
export interface ReviewTaskEntry {
  /** Phase the review task belongs to, e.g. `A`. */
  readonly phase: string;
  /** Ordered reviewer profile slugs declared on the task; empty = general reviewer. */
  readonly profiles: ReadonlyArray<string>;
  /** True when the review task is complete. */
  readonly complete: boolean;
}

/**
 * The default review series name for a spec. The convention is identity — a
 * spec named `ship-login` is reviewed as series `ship-login`.
 * @param specName - spec directory slug
 * @returns the review series name
 */
export const seriesName = (specName: string): string => specName;

/**
 * The review series name a declared reviewer profile adds: the literal join of
 * the spec name and the profile with a single hyphen.
 * @param specName - spec directory slug
 * @param profile - reviewer profile slug
 * @returns the profile's review series name
 */
export const profileSeriesName = (specName: string, profile: string): string =>
  `${specName}-${profile}`;

/**
 * The expected review series for a spec: the default series first, then one
 * series per declared profile in declared order.
 * @param specName - spec directory slug
 * @param profiles - declared reviewer profile slugs, in order
 * @returns the expected series names
 */
export const seriesNames = (
  specName: string,
  profiles: ReadonlyArray<string>,
): ReadonlyArray<string> => [
  seriesName(specName),
  ...profiles.map((profile) => profileSeriesName(specName, profile)),
];

/**
 * The round directory a phase is reviewed in: the phase's rank, zero-padded
 * to three digits (phase `A` → `001`, `AA` → `027`). This is the *preferred*
 * round; a phase whose rank is taken writes the next round free in every
 * series, attributed back to the phase.
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
 * Verify the spec's review tasks against its review series, binding by phase
 * attribution. A `complete` review task must have a round attributed to its
 * phase (`- Phase: <phase>`) in every expected series, and those rounds must
 * agree in number. A non-complete review task requires no round. Supplied
 * series outside the expected set are ignored. Pure — no IO.
 * @param specName - spec directory slug
 * @param reviewTasks - the spec's `review` tasks
 * @param series - the review series snapshots supplied by the caller
 * @returns the result; `valid` is true only with zero issues
 */
export const verify = (
  specName: string,
  reviewTasks: ReadonlyArray<ReviewTaskEntry>,
  series: ReadonlyArray<SeriesSnapshot>,
): Result => {
  const issues: Array<Issue> = [];
  const byName = new Map(series.map((snapshot) => [snapshot.name, snapshot]));

  for (const task of reviewTasks) {
    if (!task.complete) continue;
    const phase = task.phase;
    const attributed = new Map<string, string>();

    for (const name of seriesNames(specName, task.profiles)) {
      const snapshot = byName.get(name);
      if (snapshot === undefined) {
        issues.push(
          issue(
            'review-series',
            `Phase '${phase}' has a review task but review series '${name}' does not exist.`,
          ),
        );
        continue;
      }
      const round = snapshot.rounds.find((candidate) => candidate.phase === phase);
      if (round === undefined) {
        issues.push(
          issue(
            'review-series',
            `Phase '${phase}' has a review task but series '${name}' has no round attributed to phase '${phase}'.`,
          ),
        );
        continue;
      }
      attributed.set(name, round.round);
    }

    const first = attributed.entries().next();
    if (first.done === true) continue;
    const [referenceName, referenceRound] = first.value;
    for (const [name, round] of attributed) {
      if (name === referenceName || round === referenceRound) continue;
      issues.push(
        issue(
          'review-series',
          `Phase '${phase}' is reviewed at round ${referenceRound} in '${referenceName}' but round ${round} in '${name}'.`,
        ),
      );
    }
  }

  return { valid: noErrors(issues), issues };
};
