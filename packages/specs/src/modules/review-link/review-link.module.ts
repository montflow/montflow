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

/** One finding as the review-cycle policy reads it. */
export interface RoundFinding {
  /** Stable finding id, e.g. `F1`. */
  readonly id: string;
  /** Raw `- Severity:` value; may be empty or unparsable. */
  readonly severity: string;
  /** Raw `- Status:` value; may be empty or unparsable. */
  readonly status: string;
}

/** The two overflow authorizations a round may declare. */
export const OVERFLOW_AUTHORIZATIONS = ['autonomous', 'user'] as const;

/** One overflow authorization. */
export type OverflowAuthorization = (typeof OVERFLOW_AUTHORIZATIONS)[number];

/**
 * A round's `- Overflow:` declaration. The line's presence is what marks the
 * round as an intentional overflow; a missing authorization is a broken one,
 * never a silent pass.
 */
export interface RoundOverflow {
  /** The declared reason, verbatim. */
  readonly reason: string;
  /** The parsed authorization when it is one of {@link OVERFLOW_AUTHORIZATIONS}. */
  readonly authorized?: OverflowAuthorization | undefined;
  /** The raw authorization token, so a broken value is reportable. */
  readonly rawAuthorized: string;
}

/**
 * A round's `- Disposition: minor-deferred` closure. Deferral is a closure, not
 * a waiver: it passes only when every named finding exists and is Minor/Nit.
 */
export interface RoundDeferral {
  /** The declared disposition; only `minor-deferred` produces this record. */
  readonly disposition: string;
  /** The deferred finding ids named by `- Deferred:`. */
  readonly deferred: ReadonlyArray<string>;
  /** Deferred ids with no matching finding in the round. */
  readonly missing: ReadonlyArray<string>;
  /** Severity of every deferred finding that exists, in declared order. */
  readonly severities: ReadonlyArray<string>;
  /** Deferred ids whose severity is not Minor/Nit (or is unparsable). */
  readonly invalidIds: ReadonlyArray<string>;
  /** True when at least one deferred finding is not Minor/Nit. */
  readonly severityInvalid: boolean;
  /** True when the closure is structurally valid and every deferred finding is Minor/Nit. */
  readonly valid: boolean;
}

/** One round of a review series, with the phase it reviews when attributed. */
export interface SeriesRoundSnapshot {
  /** Round directory name, e.g. `001`. */
  readonly round: string;
  /** The phase the round reviews, from its `- Phase:` metadata, when set. */
  readonly phase?: string | undefined;
  /** True when the round's `- Status: closed` metadata marks it as passed. */
  readonly passed?: boolean | undefined;
  /** The round's findings, when the caller supplied them. */
  readonly findings?: ReadonlyArray<RoundFinding> | undefined;
  /** The round's `minor-deferred` closure, when it declares one. */
  readonly deferral?: RoundDeferral | undefined;
  /** The round's overflow declaration, when it carries one. */
  readonly overflow?: RoundOverflow | undefined;
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

/** Stable code for a `minor-deferred` closure that defers a Critical/Major. */
export const REVIEW_DEFERRED_SEVERITY_CODE = 'review.deferred-severity';

/** Stable code for an over-budget round whose overflow authorization is broken. */
export const REVIEW_OVERFLOW_EXHAUSTED_CODE = 'review.overflow-exhausted';

/** One phase's review-cycle budget, as its task sizes derive it. */
export interface PhaseBudget {
  /** Phase id, e.g. `A`. */
  readonly phase: string;
  /** Rounds that phase's review may spend across one series. */
  readonly budget: number;
}

/** The body section a round's metadata lives in. */
const METADATA_HEADING = /^##\s+Metadata\s*$/;

/** Any level-2 heading, which ends a round's metadata section. */
const ROUND_SECTION_HEADING = /^##\s+\S/;

/** A `- Key: value` line inside a round section. */
const METADATA_LINE = /^-\s*([^:]+?)\s*:\s*(.*)$/;

/** The `## Metadata` key that declares a deferred closure. */
export const ROUND_DISPOSITION_FIELD = 'Disposition';

/** The `## Metadata` key that names the deferred finding ids. */
export const ROUND_DEFERRED_FIELD = 'Deferred';

/** The `## Metadata` key that declares an intentional overflow. */
export const ROUND_OVERFLOW_FIELD = 'Overflow';

/** The `## Metadata` key that authorizes an intentional overflow. */
export const ROUND_OVERFLOW_AUTHORIZED_FIELD = 'Overflow-authorized';

/** The disposition that closes a Minor/Nit-only round without another cycle. */
export const MINOR_DEFERRED_DISPOSITION = 'minor-deferred';

/** The four finding severities, most severe first. */
export const SEVERITIES = ['Critical', 'Major', 'Minor', 'Nit'] as const;

/** One finding severity. */
export type Severity = (typeof SEVERITIES)[number];

/**
 * True when a raw severity is one of the four review severities. An unparsable
 * severity is never silently a Minor: the policy escalates it instead.
 * @param value - raw `- Severity:` value
 * @returns true for a known severity
 */
export const isSeverity = (value: string): value is Severity =>
  SEVERITIES.some((severity) => severity === value);

/** One round's `## Metadata` fields, keyed exactly as written. */
export type RoundMetadata = Readonly<Record<string, string>>;

/**
 * The `## Metadata` fields of one round. Only `- Key: value` lines inside the
 * metadata section count; the section ends at the next level-2 heading.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the fields, first occurrence winning
 */
export const roundMetadata = (markdown: string): RoundMetadata => {
  const entries: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  let inside = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (METADATA_HEADING.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (ROUND_SECTION_HEADING.test(line)) break;
    const match = METADATA_LINE.exec(line);
    if (match === null) continue;
    const key = (match[1] ?? '').trim();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    entries.push([key, (match[2] ?? '').trim()]);
  }
  return Object.fromEntries(entries);
};

/** The `## Findings` section name. */
const FINDINGS_SECTION = 'Findings';

/** A finding heading: `### F1 — title`. */
const FINDING_HEADING = /^###\s+(F\d+)\b/;

/**
 * Parse every `### F<n>` finding in a round's `## Findings` section and keep
 * its raw Severity and Status. Pure and forgiving: a missing field is an empty
 * string so the policy can escalate it instead of guessing.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the findings in document order
 */
export const roundFindings = (markdown: string): ReadonlyArray<RoundFinding> => {
  const findings: Array<RoundFinding> = [];
  let section = '';
  let current:
    | { id: string; severity?: string | undefined; status?: string | undefined }
    | undefined;
  const flush = (): void => {
    if (current === undefined) return;
    findings.push({
      id: current.id,
      severity: current.severity ?? '',
      status: current.status ?? '',
    });
    current = undefined;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading !== null) {
      flush();
      section = (heading[1] ?? '').trim();
      continue;
    }
    if (section !== FINDINGS_SECTION) continue;
    const found = FINDING_HEADING.exec(line);
    if (found !== null) {
      flush();
      current = { id: found[1] ?? '' };
      continue;
    }
    if (current === undefined) continue;
    const field = METADATA_LINE.exec(line);
    if (field === null) continue;
    const key = (field[1] ?? '').trim().toLowerCase();
    if (key === 'severity' && current.severity === undefined)
      current.severity = (field[2] ?? '').trim();
    if (key === 'status' && current.status === undefined) current.status = (field[2] ?? '').trim();
  }
  flush();
  return findings;
};

/**
 * True when a finding is still open. Only `Resolved` and `Won't Fix` are
 * terminal; an unrecognized status stays open so it can never pass silently.
 * @param finding - one parsed finding
 * @returns true for a non-terminal finding
 */
export const isOpenFinding = (candidate: RoundFinding): boolean =>
  candidate.status !== 'Resolved' && candidate.status !== "Won't Fix";

/**
 * Read a round's overflow declaration. The `- Overflow:` line's presence is
 * what makes the round an intentional overflow; the authorization is read
 * separately so a missing or misspelled token is reportable.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the declaration, or undefined when the round declares no overflow
 */
export const roundOverflow = (markdown: string): RoundOverflow | undefined => {
  const metadata = roundMetadata(markdown);
  const reason = metadata[ROUND_OVERFLOW_FIELD];
  if (reason === undefined) return undefined;
  const rawAuthorized = metadata[ROUND_OVERFLOW_AUTHORIZED_FIELD] ?? '';
  const authorized = OVERFLOW_AUTHORIZATIONS.find((value) => value === rawAuthorized);
  return authorized === undefined
    ? { reason, rawAuthorized }
    : { reason, rawAuthorized, authorized };
};

/**
 * Read a round's `minor-deferred` closure. The closure is valid only when it
 * names at least one finding, every named finding exists, and every one is
 * Minor/Nit. A deferred Critical/Major is never a passing closure.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the closure, or undefined when the round declares no deferral
 */
export const roundDeferral = (markdown: string): RoundDeferral | undefined => {
  const metadata = roundMetadata(markdown);
  const disposition = (metadata[ROUND_DISPOSITION_FIELD] ?? '').trim().toLowerCase();
  if (disposition !== MINOR_DEFERRED_DISPOSITION) return undefined;
  const deferred = [
    ...new Set((metadata[ROUND_DEFERRED_FIELD] ?? '').match(/F\d+/gu)?.map(String) ?? []),
  ];
  const findings = new Map(roundFindings(markdown).map((candidate) => [candidate.id, candidate]));
  const missing = deferred.filter((id) => !findings.has(id));
  const severities: Array<string> = [];
  const invalidIds: Array<string> = [];
  for (const id of deferred) {
    const candidate = findings.get(id);
    if (candidate === undefined) continue;
    severities.push(candidate.severity);
    if (candidate.severity !== 'Minor' && candidate.severity !== 'Nit') invalidIds.push(id);
  }
  const severityInvalid = invalidIds.length > 0;
  return {
    disposition: MINOR_DEFERRED_DISPOSITION,
    deferred,
    missing,
    severities,
    invalidIds,
    severityInvalid,
    valid: deferred.length > 0 && missing.length === 0 && !severityInvalid,
  };
};

/**
 * True when a round is a passing closure: `- Status: closed`, or a valid
 * `- Disposition: minor-deferred` closure. A round with no status, any other
 * status, or a broken deferral does not lock its phase.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns true when the round passed
 */
export const roundPassed = (markdown: string): boolean => {
  const metadata = roundMetadata(markdown);
  if ((metadata['Status'] ?? '').toLowerCase() === 'closed') return true;
  return roundDeferral(markdown)?.valid === true;
};

/**
 * The latest round attributed to a phase, by round directory name. Round
 * numbers are global to the spec, so the highest attributed round is the one
 * whose findings the cycle policy reads.
 * @param rounds - one series' rounds
 * @param phase - the phase id
 * @returns the latest attributed round, or undefined
 */
export const latestRoundForPhase = (
  rounds: ReadonlyArray<SeriesRoundSnapshot>,
  phase: string,
): SeriesRoundSnapshot | undefined => {
  const attributed = rounds
    .filter((round) => round.phase === phase)
    .toSorted((left, right) => left.round.localeCompare(right.round));
  return attributed[attributed.length - 1];
};

/**
 * The phases with at least one passed (`Status: closed`) round attributed to
 * them across the supplied review series. This is the only source of phase
 * locks: a complete phase with no passed round stays unlocked.
 * @param series - the linked review series snapshots
 * @returns the derived locked phases, in phase-rank order
 */
export const passedPhases = (series: ReadonlyArray<SeriesSnapshot>): ReadonlyArray<string> => {
  const phases = new Set<string>();
  for (const snapshot of series) {
    for (const round of snapshot.rounds) {
      if (round.phase !== undefined && round.passed === true) phases.add(round.phase);
    }
  }
  return [...phases].toSorted((a, b) => phaseRank(a) - phaseRank(b));
};

/**
 * The phase a review round reviews, read from its `## Metadata` section. A
 * round outside a phase (a standalone review) has no attribution. The captured
 * token must be a well-formed phase id, so a lowercased or decorated
 * `- Phase:` line counts as unattributed instead of buying an uncounted round.
 * @param markdown - raw round `REVIEW.md` contents
 * @returns the attributed phase, or undefined
 */
export const roundPhase = (markdown: string): string | undefined => {
  const declared = roundMetadata(markdown)['Phase'];
  return declared !== undefined && isValidPhase(declared) ? declared : undefined;
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
      const attributed = snapshot.rounds
        .filter((round) => round.phase === phase)
        .toSorted((left, right) => left.round.localeCompare(right.round));
      const count = attributed.length;
      if (count <= budget) continue;
      const overflowRounds = attributed.slice(budget);
      const undeclared = overflowRounds.filter((round) => round.overflow === undefined);
      if (undeclared.length > 0) {
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
        continue;
      }
      const broken = overflowRounds.filter(
        (round) =>
          round.overflow !== undefined &&
          (round.overflow.reason.trim() === '' || round.overflow.authorized === undefined),
      );
      const autonomous = overflowRounds.filter(
        (round) => round.overflow?.authorized === 'autonomous',
      ).length;
      if (broken.length === 0 && autonomous <= 1) continue;
      issues.push(
        finding({
          code: REVIEW_OVERFLOW_EXHAUSTED_CODE,
          field: 'review-series',
          message: `Review series '${name}' holds ${count} rounds attributed to phase '${phase}' (budget ${budget}) with a broken overflow authorization.`,
          expected:
            "one '- Overflow-authorized: autonomous' round past the budget, or a '- Overflow-authorized: user' round for each guided overflow",
          actual: `${broken.length} overflow round(s) without a valid authorization, ${autonomous} autonomous overflow(s)`,
          fix: `Give the overflow round a non-empty '- Overflow: <reason>' and '- Overflow-authorized: autonomous|user'; autonomous allows at most one overflow per phase per series (budget + 1 rounds), and guided must have the user authorize every round.`,
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
      const round = latestRoundForPhase(snapshot.rounds, phase);
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

/**
 * Verify deferred closures independently of round presence. A round closed
 * `minor-deferred` passes only when every deferred finding is Minor/Nit; a
 * deferred Critical/Major is `review.deferred-severity`. This check runs
 * whenever a series exists, so a historical spec that legitimately has no
 * round is unaffected. Pure — no IO.
 * @param specName - spec directory slug
 * @param reviewTasks - the spec's `review` tasks
 * @param series - the review series snapshots supplied by the caller
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyDeferrals = (
  specName: string,
  reviewTasks: ReadonlyArray<ReviewTaskEntry>,
  series: ReadonlyArray<SeriesSnapshot>,
): Result => {
  const issues: Array<Issue> = [];
  const byName = new Map(series.map((snapshot) => [snapshot.name, snapshot]));
  const checked = new Set<string>();
  for (const task of reviewTasks) {
    for (const name of seriesNames(specName, task.profiles)) {
      const key = `${name}:${task.phase}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const round = latestRoundForPhase(byName.get(name)?.rounds ?? [], task.phase);
      if (round?.deferral?.severityInvalid !== true) continue;
      issues.push(
        finding({
          code: REVIEW_DEFERRED_SEVERITY_CODE,
          field: 'review-series',
          message: `Phase '${task.phase}' round '${round.round}' in series '${name}' defers ${round.deferral.invalidIds.join(', ')} as minor-deferred, but a deferred finding is Critical/Major or has no parsable severity.`,
          expected: 'every deferred finding to be Minor or Nit',
          actual: `deferred ${round.deferral.deferred.join(', ')}`,
          fix: `Fix or escalate the deferred Critical/Major finding, or remove it from '- ${ROUND_DEFERRED_FIELD}:' so the round does not pass.`,
        }),
      );
    }
  }
  return { valid: noErrors(issues), issues };
};
