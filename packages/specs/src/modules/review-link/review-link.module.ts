import { isValidPhase } from '../spec/index.js';
import { phaseOf, phaseRank } from '../task/index.js';
import { type Issue, type Result, finding, issue, noErrors } from '../verify/index.js';

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

/** Stable code for a review series holding more rounds for a phase than it may. */
export const REVIEW_BUDGET_EXCEEDED_CODE = 'review.budget-exceeded';

/** Stable code for a round whose phase attribution is missing or malformed. */
export const REVIEW_PHASE_UNATTRIBUTED_CODE = 'review.phase-unattributed';

/** One phase's review-cycle budget, as its task sizes derive it. */
export interface PhaseBudget {
  /** Phase id, e.g. `A`. */
  readonly phase: string;
  /** Rounds that phase's review may spend across one series. */
  readonly budget: number;
}

/** The body section a round's phase attribution lives in. */
const METADATA_HEADING = /^##\s+Metadata\s*$/;

/** Any level-2 heading, which ends a round's metadata section. */
const ROUND_SECTION_HEADING = /^##\s+\S/;

/** A round's `- Phase: <phase>` metadata line. */
const PHASE_LINE = /^-\s+Phase:\s*(\S+)\s*$/;

/**
 * The phase a review round reviews, read from its `## Metadata` section. A
 * round outside a phase (a standalone review) has no attribution. The captured
 * token must be a well-formed phase id, so a lowercased or decorated
 * `- Phase:` line counts as unattributed instead of buying an uncounted round.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the attributed phase, or undefined
 */
export const roundPhase = (markdown: string): string | undefined => {
  let inside = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (METADATA_HEADING.test(line.trim())) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (ROUND_SECTION_HEADING.test(line)) return undefined;
    const match = PHASE_LINE.exec(line.trim());
    if (match !== null)
      return match[1] !== undefined && isValidPhase(match[1]) ? match[1] : undefined;
  }
  return undefined;
};

/**
 * Verify the review-cycle budget mechanically: a series may hold at most the
 * phase's budget in rounds attributed to that phase (`- Phase: <phase>` in the
 * round's `## Metadata`). Round numbers are global to the spec, so only the
 * attribution counts. A series the spec is not expected to own is ignored, and
 * a phase without a budget entry is skipped rather than guessed.
 *
 * A round in an expected series with no parsable attribution is a warning
 * (`review.phase-unattributed`), never a silent exemption: the budget is only
 * mechanical while every round is either counted or reported. `--strict`
 * promotes the warning, and the compact summary keeps its count visible. Pure —
 * no IO.
 * @param expected - the series names the spec is linked to
 * @param phases - each phase's derived budget
 * @param series - the review series snapshots supplied by the caller
 * @returns the result; `valid` is true only with zero over-budget series
 */
export const verifyBudgets = (
  expected: ReadonlyArray<string>,
  phases: ReadonlyArray<PhaseBudget>,
  series: ReadonlyArray<SeriesSnapshot>,
): Result => {
  const issues: Array<Issue> = [];
  const byName = new Map(series.map((snapshot) => [snapshot.name, snapshot]));
  for (const name of expected) {
    const snapshot = byName.get(name);
    if (snapshot === undefined) continue;
    for (const { phase, budget } of phases) {
      const count = snapshot.rounds.filter((round) => round.phase === phase).length;
      if (count <= budget) continue;
      issues.push(
        finding({
          code: REVIEW_BUDGET_EXCEEDED_CODE,
          field: 'review-series',
          message: `Review series '${name}' holds ${count} rounds attributed to phase '${phase}'; the phase budget is ${budget}.`,
          expected: `at most ${budget} round${budget === 1 ? '' : 's'} for phase '${phase}'`,
          actual: `${count} rounds`,
          fix: `Record the escalation in phase '${phase}' review task's MEMORY.md and ask the user; no further round may be opened in series '${name}'. The budget is the largest non-review task size in phase '${phase}'.`,
        }),
      );
    }
    for (const round of snapshot.rounds) {
      if (round.phase !== undefined) continue;
      issues.push(
        finding({
          code: REVIEW_PHASE_UNATTRIBUTED_CODE,
          field: 'review-series',
          severity: 'warning',
          message: `Review series '${name}' round '${round.round}' has no phase attribution, so it counts toward no phase budget.`,
          expected: "a '- Phase: <id>' line in the round's Metadata",
          actual: 'no attribution',
          fix: `Add '- Phase: <id>' to the '## Metadata' section of '${name}/${round.round}/REVIEW.md', or the round stays outside every phase budget.`,
        }),
      );
    }
  }
  return { valid: noErrors(issues), issues };
};

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
