/**
 * The review-cycle policy: one deterministic decision per phase, derived from
 * the rounds the review store already holds.
 *
 * The policy is intentionally pure. The caller supplies the phase estimate, the
 * effective waiver, and every expected review series as the store sees them;
 * this module owns the decision matrix, the strictest-wins rule across series,
 * and the reason codes. It never reads disk, writes state, or infers the
 * interaction mode.
 */

import {
  REVIEW_OVERFLOW_EXHAUSTED_CODE,
  REVIEW_PHASE_UNATTRIBUTED_CODE,
  type RoundFinding,
  type SeriesRoundSnapshot,
  type SeriesSnapshot,
  isOpenFinding,
  isSeverity,
  latestRoundForPhase,
  seriesNames,
} from '../review-link/index.js';
import { phaseRank } from '../task/index.js';

/** The decisions a phase review can reach, in increasing strictness. */
export const REVIEW_DECISIONS = [
  'waived',
  'pass',
  'fix-and-stop',
  'start',
  'rework',
  'overflow',
  'escalate',
] as const;

/** One phase review decision. */
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** The interaction modes the caller may pass; there is no other source. */
export const REVIEW_MODES = ['guided', 'autonomous'] as const;

/** One interaction mode. */
export type ReviewMode = (typeof REVIEW_MODES)[number];

/**
 * The conservative branch an omitted `--mode` takes. Guided escalates at the
 * cap instead of granting an overflow, so silence never authorizes extra work.
 */
export const DEFAULT_REVIEW_MODE: ReviewMode = 'guided';

/** Stable reason codes, one per matrix row. */
export const REVIEW_REASONS = {
  waived: 'review.waived',
  roundMissing: 'review.round-missing',
  phaseUnattributed: REVIEW_PHASE_UNATTRIBUTED_CODE,
  clean: 'review.clean',
  minorOnly: 'review.minor-only',
  budgetRemaining: 'review.budget-remaining',
  escalateCap: 'review.escalate-cap',
  overflowEligible: 'review.overflow-eligible',
  overflowExhausted: REVIEW_OVERFLOW_EXHAUSTED_CODE,
  severityUnparsable: 'review.severity-unparsable',
} as const;

/** Stable code for a complete review task whose round did not pass. */
export const REVIEW_NOT_PASSED_CODE = 'review.not-passed';

/** Strictness order used to combine per-series decisions. */
const DECISION_RANK = {
  waived: 0,
  pass: 1,
  'fix-and-stop': 2,
  start: 3,
  rework: 4,
  overflow: 5,
  escalate: 6,
} satisfies Record<ReviewDecision, number>;

/**
 * True when a raw mode is one of {@link REVIEW_MODES}.
 * @param value - candidate mode
 * @returns true for `guided` or `autonomous`
 */
export const isReviewMode = (value: string): value is ReviewMode =>
  REVIEW_MODES.some((mode) => mode === value);

/** Open finding counts by severity. */
export interface ReviewOpenCounts {
  /** Open Critical findings. */
  readonly critical: number;
  /** Open Major findings. */
  readonly major: number;
  /** Open Minor findings. */
  readonly minor: number;
  /** Open Nit findings. */
  readonly nit: number;
}

/** One series' decision and the evidence behind it. */
export interface SeriesDecision {
  /** Series directory name, e.g. `<spec>` or `<spec>-<profile>`. */
  readonly series: string;
  /** Rounds attributed to the phase in this series. */
  readonly rounds: number;
  /** Findings still open in the latest attributed round, by severity. */
  readonly open: ReviewOpenCounts;
  /** This series' decision. */
  readonly decision: ReviewDecision;
  /** The reason code for this series' decision. */
  readonly reason: string;
}

/** The whole phase decision, plus the per-series breakdown. */
export interface ReviewDecisionReport {
  /** Spec directory slug. */
  readonly name: string;
  /** Phase id the decision concerns. */
  readonly phase: string;
  /** Interaction mode the caller supplied (never inferred elsewhere). */
  readonly mode: ReviewMode;
  /** The phase's derived round budget. */
  readonly budget: number;
  /** The strictest decision across every expected series. */
  readonly decision: ReviewDecision;
  /** The reason code for the strictest decision. */
  readonly reason: string;
  /** The highest attributed-round count across the expected series. */
  readonly rounds: number;
  /** Open findings across the latest attributed round of every series. */
  readonly open: ReviewOpenCounts;
  /** One entry per expected series, in declared order. */
  readonly series: ReadonlyArray<SeriesDecision>;
}

/** One series' inputs to the policy. */
export interface SeriesPolicyInput {
  /** Series directory name. */
  readonly series: string;
  /** Every round the store reports for the series. */
  readonly rounds: ReadonlyArray<SeriesRoundSnapshot>;
  /** Phase id the decision concerns. */
  readonly phase: string;
  /** The phase's derived budget. */
  readonly budget: number;
  /** The caller-supplied interaction mode. */
  readonly mode: ReviewMode;
}

/** Everything {@link decide} reads. */
export interface ReviewPolicyInput {
  /** Spec directory slug. */
  readonly name: string;
  /** Phase id the decision concerns. */
  readonly phase: string;
  /** The caller-supplied interaction mode. */
  readonly mode: ReviewMode;
  /** The phase's derived budget. */
  readonly budget: number;
  /** True when the phase's waiver is effective. */
  readonly waived: boolean;
  /** Reviewer profile slugs declared on the phase's review task, in order. */
  readonly profiles: ReadonlyArray<string>;
  /** Every review series the store reports for the spec. */
  readonly series: ReadonlyArray<SeriesSnapshot>;
}

/** Zeroed open counts. */
export const NO_OPEN: ReviewOpenCounts = { critical: 0, major: 0, minor: 0, nit: 0 };

/** Sum two open-count records. */
const addCounts = (left: ReviewOpenCounts, right: ReviewOpenCounts): ReviewOpenCounts => ({
  critical: left.critical + right.critical,
  major: left.major + right.major,
  minor: left.minor + right.minor,
  nit: left.nit + right.nit,
});

/** Count open findings by severity. An unparsable severity is counted nowhere. */
const countOpen = (findings: ReadonlyArray<RoundFinding>): ReviewOpenCounts => {
  const counts = { critical: 0, major: 0, minor: 0, nit: 0 } satisfies ReviewOpenCounts;
  for (const finding of findings) {
    if (finding.severity === 'Critical') counts.critical += 1;
    else if (finding.severity === 'Major') counts.major += 1;
    else if (finding.severity === 'Minor') counts.minor += 1;
    else if (finding.severity === 'Nit') counts.nit += 1;
  }
  return counts;
};

/** The one decision matrix, evaluated in the order TASK.md declares. */
const decideSeries = (input: SeriesPolicyInput): SeriesDecision => {
  const attributed = input.rounds
    .filter((round) => round.phase === input.phase)
    .toSorted((left, right) => left.round.localeCompare(right.round));
  const latest = latestRoundForPhase(input.rounds, input.phase);
  const open =
    latest === undefined ? NO_OPEN : countOpen((latest.findings ?? []).filter(isOpenFinding));
  const base = { series: input.series, rounds: attributed.length, open };

  // 2. No round attributed to the phase in an expected series.
  if (latest === undefined)
    return { ...base, decision: 'start', reason: REVIEW_REASONS.roundMissing };

  // 3. A round in the series carries no phase attribution.
  if (input.rounds.some((round) => round.phase === undefined))
    return { ...base, decision: 'escalate', reason: REVIEW_REASONS.phaseUnattributed };

  const openFindings = (latest.findings ?? []).filter(isOpenFinding);

  // An unparsable severity is never a silent Minor.
  if (openFindings.some((finding) => !isSeverity(finding.severity)))
    return { ...base, decision: 'escalate', reason: REVIEW_REASONS.severityUnparsable };

  // 4. Zero open findings.
  if (openFindings.length === 0) return { ...base, decision: 'pass', reason: REVIEW_REASONS.clean };

  // 5. Every open finding is Minor/Nit, regardless of remaining budget.
  if (openFindings.every((finding) => finding.severity === 'Minor' || finding.severity === 'Nit'))
    return { ...base, decision: 'fix-and-stop', reason: REVIEW_REASONS.minorOnly };

  // 6. A Critical/Major is open and the phase still has a cycle.
  if (attributed.length < input.budget)
    return { ...base, decision: 'rework', reason: REVIEW_REASONS.budgetRemaining };

  // 7. A Critical/Major is open at the cap.
  if (input.mode === 'guided')
    return { ...base, decision: 'escalate', reason: REVIEW_REASONS.escalateCap };
  if (attributed.length < input.budget + 1)
    return { ...base, decision: 'overflow', reason: REVIEW_REASONS.overflowEligible };
  return { ...base, decision: 'escalate', reason: REVIEW_REASONS.overflowExhausted };
};

/** The strictest of two decisions; ties keep the left entry. */
const strictest = (left: SeriesDecision, right: SeriesDecision): SeriesDecision =>
  DECISION_RANK[right.decision] > DECISION_RANK[left.decision] ? right : left;

/**
 * Decide one phase's review cycle. The matrix is evaluated per expected series,
 * then the strictest decision wins:
 * `escalate > overflow > rework > start > fix-and-stop > pass > waived`.
 * A phase with an effective waiver short-circuits to `waived` for every series.
 * @param input - phase, mode, budget, waiver, and every expected series
 * @returns the decision and its per-series breakdown
 */
export const decide = (input: ReviewPolicyInput): ReviewDecisionReport => {
  const byName = new Map(input.series.map((snapshot) => [snapshot.name, snapshot]));
  const names = seriesNames(input.name, input.profiles);
  const series = names.map((name): SeriesDecision => {
    const snapshot = byName.get(name);
    const decision = decideSeries({
      series: name,
      rounds: snapshot?.rounds ?? [],
      phase: input.phase,
      budget: input.budget,
      mode: input.mode,
    });
    return input.waived
      ? { ...decision, decision: 'waived', reason: REVIEW_REASONS.waived }
      : decision;
  });

  const rounds = series.reduce((used, entry) => Math.max(used, entry.rounds), 0);
  const open = series.reduce((total, entry) => addCounts(total, entry.open), NO_OPEN);
  const strictestEntry =
    series.length === 0 ? undefined : series.reduce((chosen, entry) => strictest(chosen, entry));
  const decision = strictestEntry?.decision ?? 'start';
  const reason = strictestEntry?.reason ?? REVIEW_REASONS.roundMissing;

  return {
    name: input.name,
    phase: input.phase,
    mode: input.mode,
    budget: input.budget,
    decision,
    reason,
    rounds,
    open,
    series,
  };
};

/** One phase's inputs to the shared review-pass predicate. */
export interface PhaseReviewInput {
  /** Phase id, e.g. `A`. */
  readonly phase: string;
  /** Reviewer profile slugs declared on the phase's review task, in order. */
  readonly profiles: ReadonlyArray<string>;
  /** The phase's derived round budget. */
  readonly budget: number;
  /** True when the phase's waiver is effective. */
  readonly waived: boolean;
}

/** One phase's derived review verdict. */
export interface PhaseReviewVerdict {
  /** Phase id. */
  readonly phase: string;
  /** True only when the phase may lock on its review. */
  readonly passed: boolean;
  /** The strictest decision across the expected series. */
  readonly decision: ReviewDecision;
  /** The reason code for that decision. */
  readonly reason: string;
}

/**
 * The reviewer's verdict alone: an effective waiver, or `review decide`
 * returning `pass`. This is what `claim --close` reads when it closes a review
 * task, because the prompt closes the task before it marks the round
 * `- Status: closed`.
 * @param name - spec directory slug
 * @param input - phase, profiles, budget, and effective waiver
 * @param series - the review series snapshots supplied by the caller
 * @returns the verdict and the decision behind it
 */
export const reviewDecisionPassed = (
  name: string,
  input: PhaseReviewInput,
  series: ReadonlyArray<SeriesSnapshot>,
): PhaseReviewVerdict => {
  const report = decide({
    name,
    phase: input.phase,
    mode: DEFAULT_REVIEW_MODE,
    budget: input.budget,
    waived: input.waived,
    profiles: input.profiles,
    series,
  });
  return {
    phase: input.phase,
    passed: input.waived || report.decision === 'pass',
    decision: report.decision,
    reason: report.reason,
  };
};

/**
 * The one lock predicate every lock surface reads. A phase passes when its
 * effective waiver is in force, or when `review decide` returns `pass` AND the
 * latest attributed round in every expected series is itself a passing closure
 * (`- Status: closed` or a valid `minor-deferred`). The decision alone is not
 * enough: an open round with no findings would otherwise read as clean.
 * @param name - spec directory slug
 * @param input - phase, profiles, budget, and effective waiver
 * @param series - the review series snapshots supplied by the caller
 * @returns the verdict and the decision behind it
 */
export const reviewVerdict = (
  name: string,
  input: PhaseReviewInput,
  series: ReadonlyArray<SeriesSnapshot>,
): PhaseReviewVerdict => {
  const verdict = reviewDecisionPassed(name, input, series);
  if (input.waived) return verdict;
  const byName = new Map(series.map((snapshot) => [snapshot.name, snapshot]));
  const closed = seriesNames(name, input.profiles).every(
    (seriesName) =>
      latestRoundForPhase(byName.get(seriesName)?.rounds ?? [], input.phase)?.passed === true,
  );
  return { ...verdict, passed: closed && verdict.passed };
};

/**
 * The phases whose review passes the shared predicate, in phase-rank order.
 * @param name - spec directory slug
 * @param phases - every phase's review inputs
 * @param series - the review series snapshots supplied by the caller
 * @returns the passing phase ids
 */
export const passedReviewPhases = (
  name: string,
  phases: ReadonlyArray<PhaseReviewInput>,
  series: ReadonlyArray<SeriesSnapshot>,
): ReadonlyArray<string> =>
  phases
    .filter((entry) => reviewVerdict(name, entry, series).passed)
    .map((entry) => entry.phase)
    .toSorted((a, b) => phaseRank(a) - phaseRank(b));

/** `1 round` / `2 rounds`. */
const plural = (count: number): string => `${count} round${count === 1 ? '' : 's'}`;

/** Render the `open <n> (critical a, major b, minor c, nit d)` field. */
export const renderOpen = (open: ReviewOpenCounts): string => {
  const total = open.critical + open.major + open.minor + open.nit;
  return `open ${total} (critical ${open.critical}, major ${open.major}, minor ${open.minor}, nit ${open.nit})`;
};

/**
 * Render one decision as text: the four contract fields, then one line per
 * expected series. The budget is shown beside the highest used count so a
 * reader sees the cap the decision used.
 * @param report - the decision to render
 * @returns the text report
 */
export const renderDecision = (report: ReviewDecisionReport): string => {
  const lines = [
    `decision ${report.decision}`,
    `rounds ${report.rounds}/${report.budget}`,
    renderOpen(report.open),
    `reason ${report.reason}`,
  ];
  for (const entry of report.series) {
    lines.push(
      `series ${entry.series}: decision ${entry.decision}, ${plural(entry.rounds)}/${report.budget}, ${renderOpen(entry.open)}, reason ${entry.reason}`,
    );
  }
  return lines.join('\n');
};

/**
 * Render one decision as JSON with the same fields as {@link renderDecision}.
 * @param report - the decision to render
 * @returns the pretty-printed JSON document
 */
export const renderDecisionJson = (report: ReviewDecisionReport): string =>
  JSON.stringify(report, null, 2);
