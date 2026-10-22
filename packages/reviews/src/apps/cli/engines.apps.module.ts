import { Clock, Effect } from 'effect';
import { ProfileStore } from '@montflow/profiles';
import { SpecStore, Task } from '@montflow/specs';
import * as Review from '../../modules/review/index.js';
import { ProfileProbe, ReviewStore } from '../../services/index.js';
import * as Doctor from '../doctor/index.js';

/**
 * The operations the review CLI offers, as plain Effect functions over the
 * review store.
 *
 * Free of argv, of a UI, and of any notion of a "front end": the binary
 * (`binary.apps.module.ts`) and the `/mf-reviews` slash command
 * (`slash.apps.module.ts`) are thin adapters over this module, so the two
 * surfaces cannot drift. Every engine fails with a displayable string.
 */

/** Where a review series lives. `dir` overrides the default store directory. */
export interface StoreScope {
  /** Project working directory. */
  readonly cwd: string;
  /** Explicit store directory, resolved against `cwd` when set. */
  readonly dir?: string | undefined;
}

/** Store path prefix used in reports, mirroring the default store location. */
const REVIEWS_PREFIX = '.agents/@montflow/reviews';

const prefixOf = (scope: StoreScope): string => scope.dir ?? REVIEWS_PREFIX;

/** Repo-relative path of a series ledger, for reports. */
export const ledgerPath = (scope: StoreScope, name: string): string =>
  `${prefixOf(scope)}/${name}/${Review.FILE_NAME}`;

/** Repo-relative path of one round file, for reports. */
export const roundPath = (scope: StoreScope, name: string, round: string): string =>
  `${prefixOf(scope)}/${name}/${round}/${Review.FILE_NAME}`;

const mapErr = (error: ReviewStore.StoreError): string => error.reason;

/** Today, as `YYYY-MM-DD`, read through Clock so tests drive it. */
const today: Effect.Effect<string> = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => new Date(millis).toISOString().slice(0, 10)),
);

/** One round's summary, for the list view. */
export interface RoundSummary {
  readonly round: string;
  readonly status: string;
  readonly findings: number;
  readonly open: number;
}

/** One series' summary, for the list view. */
export interface SeriesSummary {
  readonly name: string;
  readonly target: string;
  readonly status: string;
  readonly rounds: ReadonlyArray<RoundSummary>;
  /** Open findings across every round. */
  readonly open: number;
}

/** Summarize one round from its parsed file. */
const summarizeRound = (round: string, raw: string): RoundSummary => {
  const parsed = Review.parseRound(round, raw);
  const counts = Review.statusCounts(parsed.findings);
  return {
    round,
    status: parsed.metadata['Status'] ?? 'unknown',
    findings: parsed.findings.length,
    open: counts.Open,
  };
};

/** Summarize one series, tolerating a missing or malformed ledger or round. */
const summarizeSeries = (
  scope: StoreScope,
  name: string,
): Effect.Effect<SeriesSummary, never, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    const ledgerRaw = yield* store
      .readSeries(scope.cwd, name, scope.dir)
      .pipe(Effect.orElseSucceed(() => ''));
    const ledger = Review.parseSeries(ledgerRaw);
    const roundNames = yield* store.roundNames(scope.cwd, name, scope.dir).pipe(
      // SAFETY: a series with no readable round directory simply has no rounds.
      Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
    );
    const rounds = yield* Effect.forEach(roundNames, (round) =>
      store.readRound(scope.cwd, name, round, scope.dir).pipe(
        Effect.orElseSucceed(() => ''),
        Effect.map((raw) => summarizeRound(round, raw)),
      ),
    );
    return {
      name,
      target: ledger.metadata['Target'] ?? '',
      status: ledger.metadata['Status'] ?? 'unknown',
      rounds,
      open: rounds.reduce((total, round) => total + round.open, 0),
    };
  });

/**
 * Every review series in the store, name-sorted. A series whose ledger or
 * round is missing still appears, marked `unknown`, so `list` never hides a
 * broken store.
 * @param scope - store scope
 * @returns one summary per series
 */
export const list = (
  scope: StoreScope,
): Effect.Effect<ReadonlyArray<SeriesSummary>, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    const names = yield* store.seriesNames(scope.cwd, scope.dir).pipe(Effect.mapError(mapErr));
    return yield* Effect.forEach(names, (name) => summarizeSeries(scope, name));
  });

/**
 * The series ledger, or one round file, verbatim.
 * @param scope - store scope
 * @param name - series name
 * @param round - round directory name, or undefined for the ledger
 * @returns the file contents
 */
export const show = (
  scope: StoreScope,
  name: string,
  round?: string,
): Effect.Effect<string, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    if (round !== undefined) {
      if (!Review.isValidRound(round)) {
        return yield* Effect.fail(
          `'${round}' is not a valid round — use a three-digit number such as 001.`,
        );
      }
      return yield* store
        .readRound(scope.cwd, name, round, scope.dir)
        .pipe(Effect.mapError(mapErr));
    }
    return yield* store.readSeries(scope.cwd, name, scope.dir).pipe(Effect.mapError(mapErr));
  });

/** True when two round rows describe the same counts. */
const sameRoundRow = (a: Review.RoundRow, b: Review.RoundRow): boolean =>
  a.round === b.round &&
  a.status === b.status &&
  a.open === b.open &&
  a.inReview === b.inReview &&
  a.resolved === b.resolved &&
  a.wontFix === b.wontFix &&
  a.escalated === b.escalated;

/** True when two findings-index rows describe the same finding. */
const sameFindingsRow = (a: Review.FindingsRow, b: Review.FindingsRow): boolean =>
  a.round === b.round &&
  a.id === b.id &&
  a.severity === b.severity &&
  a.status === b.status &&
  a.title === b.title;

const sameRows = <T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>,
  same: (x: T, y: T) => boolean,
): boolean =>
  a.length === b.length &&
  a.every((row, index) => {
    const other = b[index];
    return other !== undefined && same(row, other);
  });

/**
 * The cross-file consistency checks: the ledger's `Rounds` table and
 * `Findings` index must equal what the round files actually say. On a mismatch
 * the fix is the exact table to paste.
 */
const ledgerConsistencyIssues = (
  ledger: Review.ParsedSeries,
  expectedRounds: ReadonlyArray<Review.RoundRow>,
  expectedFindings: ReadonlyArray<Review.FindingsRow>,
): ReadonlyArray<Review.VerifyIssue> => {
  const issues: Array<Review.VerifyIssue> = [];
  if (!sameRows(ledger.rounds, expectedRounds, sameRoundRow)) {
    issues.push({
      field: 'rounds',
      message: 'The Rounds table does not match the round files.',
      fix: `Replace it with:\n${Review.renderRoundsTable(expectedRounds)}`,
    });
  }
  if (!sameRows(ledger.findings, expectedFindings, sameFindingsRow)) {
    issues.push({
      field: 'findings',
      message: 'The Findings index does not match the round files.',
      fix: `Replace it with:\n${Review.renderFindingsTable(expectedFindings)}`,
    });
  }
  return issues;
};

/** One file's verification outcome, paired with its path for a report. */
export interface VerifyEntry {
  readonly path: string;
  readonly result: Review.VerifyResult;
}

/** One series' verification: its files, plus non-fatal warnings. */
export interface VerifySeriesReport {
  readonly entries: ReadonlyArray<VerifyEntry>;
  /** Non-fatal problems (e.g. the profiles extension is unavailable). */
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Mechanically verify one series: the ledger, every round, the ledger's
 * consistency with the rounds, and a declared `Profile` (delegated lazily to
 * the profiles extension). A missing ledger or round is an issue, not an
 * error — `verify` exists to report exactly that.
 * @param scope - store scope
 * @param name - series name
 * @returns one entry per file (ledger first) plus any warnings
 */
export const verifySeries = (
  scope: StoreScope,
  name: string,
): Effect.Effect<VerifySeriesReport, string, ReviewStore.ReviewStore | ProfileProbe.ProfileProbe> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    const warnings: Array<string> = [];
    const roundNames = yield* store
      .roundNames(scope.cwd, name, scope.dir)
      .pipe(Effect.mapError(mapErr));
    const entries: Array<VerifyEntry> = [];

    const parsedRounds: Array<{ round: string; parsed: Review.ParsedRound; raw: string }> = [];
    for (const round of roundNames) {
      const raw = yield* store
        .readRound(scope.cwd, name, round, scope.dir)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (raw === undefined) {
        entries.push({
          path: roundPath(scope, name, round),
          result: {
            valid: false,
            issues: [
              {
                field: 'file',
                message: `Round '${round}' has no ${Review.FILE_NAME}.`,
                fix: `Create ${roundPath(scope, name, round)} or remove the empty round directory.`,
              },
            ],
          },
        });
        continue;
      }
      parsedRounds.push({ round, parsed: Review.parseRound(round, raw), raw });
    }

    const expectedRounds = parsedRounds.map(({ round, parsed }) =>
      Review.roundRow(round, parsed.metadata['Status'] ?? 'open', parsed.findings),
    );
    const expectedFindings = parsedRounds.flatMap(({ round, parsed }) =>
      Review.findingRows(round, parsed.findings),
    );

    const ledgerRaw = yield* store
      .readSeries(scope.cwd, name, scope.dir)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (ledgerRaw === undefined) {
      entries.unshift({
        path: ledgerPath(scope, name),
        result: {
          valid: false,
          issues: [
            {
              field: 'file',
              message: `Series '${name}' has no ${Review.FILE_NAME} ledger.`,
              fix: `Create ${ledgerPath(scope, name)} with \`mf-reviews create ${name}\`.`,
            },
          ],
        },
      });
    } else {
      const ledger = Review.parseSeries(ledgerRaw);
      const issues: Array<Review.VerifyIssue> = [
        ...ledger.issues,
        ...ledgerConsistencyIssues(ledger, expectedRounds, expectedFindings),
      ];
      const profile = ledger.metadata['Profile'];
      if (profile !== undefined && profile !== '') {
        const probe = yield* ProfileProbe.ProfileProbe;
        const outcome = yield* probe.verify(profile, scope.cwd);
        if (outcome.kind === 'unavailable') {
          warnings.push(outcome.message);
        } else if (outcome.kind === 'failed') {
          issues.push({
            field: 'profile',
            message: `Profile '${profile}' failed verification: ${outcome.message}`,
          });
        }
      }
      entries.unshift({
        path: ledgerPath(scope, name),
        result: { valid: issues.length === 0, issues },
      });
    }

    for (const { round, parsed } of parsedRounds) {
      entries.push({
        path: roundPath(scope, name, round),
        result: { valid: parsed.issues.length === 0, issues: parsed.issues },
      });
    }

    return { entries, warnings };
  });

/** A whole-store verification report. */
export interface VerifyAllReport {
  readonly entries: ReadonlyArray<VerifyEntry>;
  readonly issueCount: number;
  /** Non-fatal problems (e.g. the profiles extension was unavailable). */
  readonly warnings: ReadonlyArray<string>;
}

/** Spec store directory, relative to the workspace root (mirrors `@montflow/specs`). */
const SPECS_PREFIX = '.agents/@montflow/specs';

/**
 * Resolve every spec's declared `reviewer-profiles` against the profiles store
 * (F9). Discovery reads `<cwd>/.agents/@montflow/specs` through the specs store
 * and parses each `TASK.md` with the single-owner task grammar, so a spec with
 * no series still fails on an unknown profile. An absent specs root is a no-op.
 * @param scope - store scope
 * @returns one failing entry per unresolved declared profile
 */
export const verifySpecProfiles = (
  scope: StoreScope,
): Effect.Effect<
  ReadonlyArray<VerifyEntry>,
  never,
  SpecStore.SpecStore | ProfileStore.ProfileStore
> =>
  Effect.gen(function* () {
    const specs = yield* SpecStore.SpecStore;
    const profiles = yield* ProfileStore.ProfileStore;
    const root = `${scope.cwd.replace(/\/+$/, '')}/${SPECS_PREFIX}`;
    if (!(yield* specs.hasRoot(root))) return [];
    const names = yield* specs
      .names(root)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const entries: Array<VerifyEntry> = [];
    for (const spec of names) {
      const snapshot = yield* specs
        .snapshot(root, spec)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (snapshot === undefined) continue;
      for (const file of snapshot.files) {
        if (!file.path.endsWith('TASK.md')) continue;
        const task = Task.parseTaskFile(file.content);
        if (task === undefined || task.type !== 'review') continue;
        for (const profile of new Set(task.reviewerProfiles)) {
          const found = yield* profiles
            .read(scope.cwd, profile)
            .pipe(Effect.orElseSucceed(() => undefined));
          if (found !== undefined) continue;
          entries.push({
            path: `${SPECS_PREFIX}/${spec}/${file.path}`,
            result: {
              valid: false,
              issues: [
                {
                  field: 'reviewer-profiles',
                  message: `Declared reviewer profile '${profile}' was not found under .agents/@montflow/profiles.`,
                },
              ],
            },
          });
        }
      }
    }
    return entries;
  });

/**
 * Mechanically verify every series in the store, plus every spec's declared
 * reviewer profiles (F9). An absent or empty store is a pass with zero entries —
 * a repository with no reviews yet is not broken.
 * @param scope - store scope
 * @returns every file's result, the total issue count, and any warnings
 */
export const verifyAll = (
  scope: StoreScope,
): Effect.Effect<
  VerifyAllReport,
  string,
  | ReviewStore.ReviewStore
  | ProfileProbe.ProfileProbe
  | SpecStore.SpecStore
  | ProfileStore.ProfileStore
> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    const names = yield* store.seriesNames(scope.cwd, scope.dir).pipe(Effect.mapError(mapErr));
    const groups = yield* Effect.forEach(names, (name) => verifySeries(scope, name));
    const specProfileEntries = yield* verifySpecProfiles(scope);
    const entries = [...groups.flatMap((group) => group.entries), ...specProfileEntries];
    const warnings = groups.flatMap((group) => group.warnings);
    const issueCount = entries.reduce((total, entry) => total + entry.result.issues.length, 0);
    return { entries, issueCount, warnings };
  });

/** What `resume` reports about an existing series. */
export interface ResumeResult {
  readonly name: string;
  readonly target: string;
  readonly status: string;
  readonly rounds: ReadonlyArray<RoundSummary>;
  readonly open: number;
  /** Round directory to continue, or undefined when the series has no rounds. */
  readonly latestRound: string | undefined;
  /** Path to the latest round file, or the ledger when there are no rounds. */
  readonly latest: string;
}

/**
 * Locate where an in-flight review left off: the latest round, its open-finding
 * count, and the file to open next. Fails when the series does not exist.
 * @param scope - store scope
 * @param name - series name
 * @returns the continuation point
 */
export const resume = (
  scope: StoreScope,
  name: string,
): Effect.Effect<ResumeResult, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore.ReviewStore;
    yield* store.readSeries(scope.cwd, name, scope.dir).pipe(Effect.mapError(mapErr));
    const summary = yield* summarizeSeries(scope, name);
    const latestRound = summary.rounds.at(-1)?.round;
    return {
      name: summary.name,
      target: summary.target,
      status: summary.status,
      rounds: summary.rounds,
      open: summary.open,
      latestRound,
      latest:
        latestRound === undefined ? ledgerPath(scope, name) : roundPath(scope, name, latestRound),
    };
  });

/** Fields `scaffold` accepts. */
export interface ScaffoldFields extends StoreScope {
  readonly name: string;
  /** What the series reviews. Defaults to `name`. */
  readonly target?: string | undefined;
  /** Round directory to create. Defaults to the next free round. */
  readonly round?: string | undefined;
  /** Reviewer profile to stamp on the ledger; omitted for the general reviewer. */
  readonly profile?: string | undefined;
}

/** What `scaffold` created. */
export interface ScaffoldResult {
  readonly name: string;
  readonly round: string;
  readonly ledgerPath: string;
  readonly roundPath: string;
}

/** The next free round number given the existing round directories. */
const nextRoundNumber = (existing: ReadonlyArray<string>): number =>
  existing.reduce((highest, round) => Math.max(highest, Review.roundNumber(round) || 0), 0) + 1;

/**
 * Create a round file and (re)write the series ledger to index it. Creates the
 * series when absent; refuses to overwrite an existing round.
 * @param fields - series name, optional target, optional explicit round
 * @returns the paths created
 */
export const scaffold = (
  fields: ScaffoldFields,
): Effect.Effect<ScaffoldResult, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    if (!Review.isValidName(fields.name)) {
      return yield* Effect.fail(
        `'${fields.name}' is not a valid series name — use a kebab-case slug such as 'my-review'.`,
      );
    }
    const store = yield* ReviewStore.ReviewStore;
    const existing = yield* store
      .roundNames(fields.cwd, fields.name, fields.dir)
      .pipe(Effect.mapError(mapErr));
    const round = fields.round ?? Review.formatRound(nextRoundNumber(existing));
    if (!Review.isValidRound(round)) {
      return yield* Effect.fail(
        `'${round}' is not a valid round — use a three-digit number such as 001.`,
      );
    }
    if (existing.includes(round)) {
      return yield* Effect.fail(`Round '${round}' already exists in series '${fields.name}'.`);
    }

    const created = yield* today;
    const target = fields.target ?? fields.name;
    const ledgerRaw = yield* store
      .readSeries(fields.cwd, fields.name, fields.dir)
      .pipe(Effect.orElseSucceed(() => ''));
    const existingProfile = Review.parseSeries(ledgerRaw).metadata['Profile'];
    const requestedProfile =
      fields.profile === undefined || fields.profile === '' ? undefined : fields.profile;
    if (
      requestedProfile !== undefined &&
      existingProfile !== undefined &&
      existingProfile !== '' &&
      existingProfile !== requestedProfile
    ) {
      return yield* Effect.fail(
        `Series '${fields.name}' is already bound to profile '${existingProfile}'; refusing to bind profile '${requestedProfile}'.`,
      );
    }
    const profile = requestedProfile ?? existingProfile;

    const rows: Array<Review.RoundRow> = [];
    const findings: Array<Review.FindingsRow> = [];
    for (const existingRound of existing) {
      const raw = yield* store
        .readRound(fields.cwd, fields.name, existingRound, fields.dir)
        .pipe(Effect.orElseSucceed(() => ''));
      const parsed = Review.parseRound(existingRound, raw);
      rows.push(
        Review.roundRow(existingRound, parsed.metadata['Status'] ?? 'open', parsed.findings),
      );
      findings.push(...Review.findingRows(existingRound, parsed.findings));
    }
    rows.push(Review.roundRow(round, 'open', []));

    const roundDoc = Review.renderRound({ name: fields.name, round, target, created });
    const ledgerDoc = Review.renderSeries({
      name: fields.name,
      target,
      created,
      rounds: rows,
      findings,
      profile,
    });

    yield* store
      .saveRound(fields.cwd, fields.name, round, roundDoc, fields.dir)
      .pipe(Effect.mapError(mapErr));
    yield* store
      .saveSeries(fields.cwd, fields.name, ledgerDoc, fields.dir)
      .pipe(Effect.mapError(mapErr));

    return {
      name: fields.name,
      round,
      ledgerPath: ledgerPath(fields, fields.name),
      roundPath: roundPath(fields, fields.name, round),
    };
  });

/** Doctor outcome for a repo, without the gate. */
export const doctor = (
  cwd: string,
  check: boolean,
  invocation?: string | undefined,
): Effect.Effect<Doctor.DoctorResult, string> => Doctor.runDoctor(cwd, { check, invocation });
