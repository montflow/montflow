import { Clock, Console, Data, Effect, FileSystem, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { tierOfSpec } from '../../modules/creation/index.js';
import { parseMarkdown } from '../../modules/frontmatter/index.js';
import {
  PHASE_FILE,
  PHASE_GATES_FILE,
  PHASE_MEMORY_FILE,
  isReviewReason,
  parsePhaseFile,
  parsePhaseGateStages,
  phaseEvidence,
  renderPhaseReview,
} from '../../modules/phase/index.js';
import { passedPhases } from '../../modules/review-link/index.js';
import { reviewVerdict } from '../../modules/review-policy/index.js';
import { phaseReviewBudget } from '../../modules/sizing/index.js';
import { readSpecVersion } from '../../modules/spec/index.js';
import { instant } from '../../modules/stamp/index.js';
import { type Task, parseTaskFile, phaseOf, sizeOf, sortKey } from '../../modules/task/index.js';
import { type Tier, CODES, TIER_HINT, isTier, waiverAllowed } from '../../modules/tier/index.js';
import {
  EXECUTION_BRIEF_MISSING_CODE,
  executionBriefStatus,
  type SpecSnapshot,
} from '../../modules/structure/index.js';
import { installedTierFile, shippedTierFile } from '../../modules/doctor/doctor.paths.module.js';
import { SpecStore } from '../../services/index.js';

import {
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
  workspaceRoot,
  VALIDATION_EXIT_CODE,
} from './cli.shared.module.js';

/** The `stamp` output formats. */
export const STAMP_FORMATS = ['instant', 'date'] as const;

/** One `stamp` output format. */
export type StampFormat = (typeof STAMP_FORMATS)[number];

/**
 * Produce one timestamp from the system clock. There is no `--at`: a caller may
 * never invent an instant.
 * @param format - `instant` (default) or `date`
 * @returns the formatted timestamp
 */
export const stampValue = (format: string = 'instant'): Effect.Effect<string> =>
  Clock.currentTimeMillis.pipe(
    Effect.map((millis) => (format === 'date' ? instant(millis).slice(0, 10) : instant(millis))),
  );

/** Stable codes for the `tier` verb. */
export const TIER_CODES = CODES;

/** The tier loader's coded failure. */
export class TierLoadError extends Data.TaggedError('@montflow/TierLoadError')<{
  readonly code: string;
  readonly path: string;
  readonly problem: string;
  readonly fix: string;
  readonly expected?: string;
  readonly actual?: string;
}> {}

/** Options for {@link readTier}. */
export interface TierReadOptions {
  readonly tier: string;
  readonly workspace: string;
  /** Package directory that ships the tier files; defaults to this package. */
  readonly shippedDir?: string | undefined;
  /** Installed tier directory; defaults to `<workspace>/.agents/@montflow/tiers`. */
  readonly installedDir?: string | undefined;
}

/**
 * Read exactly one tier instruction file. The value must be one enum member; a
 * missing installed file, a missing packaged copy, or a byte difference is a
 * coded refusal, never a fallback to another tier.
 * @param options - tier value, workspace, and optional test directories
 * @returns the installed file contents, verbatim
 */
export const readTier = (
  options: TierReadOptions,
): Effect.Effect<string, TierLoadError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!isTier(options.tier)) {
      return yield* Effect.fail(
        new TierLoadError({
          code: TIER_CODES.unknownTier,
          path: options.tier,
          problem: `'${options.tier}' is not a tier.`,
          expected: TIER_HINT,
          actual: options.tier,
          fix: `Pass one of: ${TIER_HINT}.`,
        }),
      );
    }
    // SAFETY: the `isTier` guard above narrowed this string to the tier union.
    const tier = options.tier as Tier;
    const installed =
      options.installedDir === undefined
        ? installedTierFile(path, options.workspace, tier)
        : path.join(options.installedDir, `${tier}.md`);
    const shipped =
      options.shippedDir === undefined
        ? shippedTierFile(path, tier)
        : path.join(options.shippedDir, `${tier}.md`);
    const installedText = yield* fs.readFileString(installed).pipe(
      Effect.matchEffect({
        onFailure: () =>
          Effect.fail(
            new TierLoadError({
              code: TIER_CODES.missingFile,
              path: installed,
              problem: `The installed tier file '${installed}' is missing.`,
              expected: `an installed ${tier} tier instruction`,
              actual: 'missing',
              fix: 'Run mf-specs doctor, then load the tier again.',
            }),
          ),
        onSuccess: (text) => Effect.succeed(text),
      }),
    );
    const shippedText = yield* fs.readFileString(shipped).pipe(
      Effect.matchEffect({
        onFailure: () =>
          Effect.fail(
            new TierLoadError({
              code: TIER_CODES.missingFile,
              path: shipped,
              problem: `The packaged tier file '${shipped}' is missing.`,
              expected: `the packaged ${tier} tier instruction`,
              actual: 'missing',
              fix: `Reinstall @montflow/specs, then run mf-specs doctor.`,
            }),
          ),
        onSuccess: (text) => Effect.succeed(text),
      }),
    );
    if (installedText !== shippedText) {
      return yield* Effect.fail(
        new TierLoadError({
          code: TIER_CODES.staleFile,
          path: installed,
          problem: `Installed '${installed}' differs from the packaged '${shipped}'.`,
          expected: 'the packaged bytes',
          actual: 'drifted bytes',
          fix: 'Run mf-specs doctor to reinstall the tier instruction.',
        }),
      );
    }
    return installedText;
  });

/** One phase's lock derivation. */
export interface LockReport {
  readonly name: string;
  readonly phase: string;
  readonly locked: boolean;
  /** One code per blocking condition, sorted and unique. */
  readonly blockers: ReadonlyArray<string>;
}

/** Options shared by the phase-record verbs. */
export interface PhaseVerbOptions {
  readonly root: string;
  readonly name: string;
  readonly phase: string;
}

/** Read and parse one spec snapshot, refusing a missing spec. */
const snapshotOf = (
  options: PhaseVerbOptions,
): Effect.Effect<
  { readonly snapshot: SpecSnapshot; readonly specText: string },
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const exists = yield* store.exists(options.root, options.name);
    if (!exists) {
      return yield* Effect.fail(
        phaseFailure(
          'spec.not-found',
          options.name,
          '--name',
          `Spec '${options.name}' does not exist.`,
          'mf-specs list',
        ),
      );
    }
    const snapshot = yield* store.snapshot(options.root, options.name);
    const specText = snapshot.files.find((entry) => entry.path === 'SPEC.md')?.content ?? '';
    return { snapshot, specText };
  });

/** True when a SPEC.md declares the current standard version. */
const isCurrentVersion = (specText: string): boolean => {
  const parsed = parseMarkdown(specText);
  if (parsed === null) return false;
  return readSpecVersion(parsed.fields).version === 2;
};

/** A phase diagnostic being filled in, so `fix` appears only when supplied. */
interface MutablePhaseDiagnostic {
  code: string;
  path: string;
  field: string;
  problem: string;
  rerun: string;
  fix?: string;
}

/** One coded refusal for a phase-record verb. */
const phaseFailure = (
  code: string,
  path: string,
  field: string,
  problem: string,
  rerun: string,
  fix?: string,
): SurfaceError => {
  const found: MutablePhaseDiagnostic = { code, path, field, problem, rerun };
  if (fix !== undefined) found.fix = fix;
  return new SurfaceError({ operation: 'SpecPhase', diagnostics: [diagnostic(found)] });
};

/** Refuse a v1 spec before a v2-only verb reads its records. */
const requireCurrentVersion = (
  options: PhaseVerbOptions,
  specText: string,
): Effect.Effect<void, SurfaceError> =>
  isCurrentVersion(specText)
    ? Effect.void
    : Effect.fail(
        phaseFailure(
          'spec.version-outdated',
          options.name,
          'spec-version',
          `Spec '${options.name}' is not on the v2 standard, so its phase records cannot be updated.`,
          `mf-specs migrate --name ${options.name}`,
          'Run migrate, then re-run this verb.',
        ),
      );

/** Every parsed task in one phase, in sort-key order. */
const tasksInPhase = (snapshot: SpecSnapshot, phase: string): ReadonlyArray<Task> => {
  const tasks: Array<Task> = [];
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(entry.content);
    if (task !== undefined && phaseOf(task.id) === phase) tasks.push(task);
  }
  return tasks.toSorted((a, b) => sortKey(a.id) - sortKey(b.id));
};

/** Options for {@link lockPhase}. */
export interface LockCheckOptions {
  /**
   * Refuse a started v2 phase whose `MEMORY.md` has no valid execution brief.
   * The `lock` verb sets it; internal callers that only ask whether a phase is
   * already locked (waiver, new-task) leave it off so they never fail early.
   */
  readonly requireBrief?: boolean | undefined;
}

/**
 * Derive whether one phase is locked. This verb only confirms: it writes
 * nothing, not even a stale status mirror. Launching conditions are one code
 * each, so a caller sees every reason the phase is not lockable.
 * @param options - spec store root, name, and phase
 * @param check - whether the brief gate applies (the `lock` verb does)
 * @returns the derived lock and its blockers
 */
export const lockPhase = (
  options: PhaseVerbOptions,
  check: LockCheckOptions = {},
): Effect.Effect<LockReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const { snapshot, specText } = yield* snapshotOf(options);
    const currentVersion = isCurrentVersion(specText);
    const phaseText = snapshot.files.find(
      (entry) =>
        entry.path === `${options.phase}/${PHASE_FILE}` && (entry.kind ?? 'file') === 'file',
    )?.content;
    const phase = phaseText === undefined ? undefined : parsePhaseFile(phaseText);
    if (currentVersion && phaseText === undefined) {
      return yield* Effect.fail(
        phaseFailure(
          'phase.missing',
          `${options.name}/${options.phase}`,
          PHASE_FILE,
          `Phase '${options.phase}' has no ${PHASE_FILE}.`,
          `mf-specs migrate --name ${options.name}`,
        ),
      );
    }
    if (currentVersion && phase === undefined) {
      return yield* Effect.fail(
        phaseFailure(
          'phase.invalid',
          `${options.name}/${options.phase}/${PHASE_FILE}`,
          PHASE_FILE,
          `${PHASE_FILE} for phase '${options.phase}' is not a readable phase record.`,
          `mf-specs check --name ${options.name}`,
          'Repair the phase record fields; lock never rewrites them.',
        ),
      );
    }
    const store = yield* SpecStore.SpecStore;
    const review = yield* store.reviewSeries(options.root, options.name);
    const evidence = phaseEvidence(snapshot);
    const tasks = tasksInPhase(snapshot, options.phase);
    if (currentVersion && phase !== undefined && (check.requireBrief ?? true)) {
      const started =
        phase.status === 'in-progress' || tasks.some((task) => task.status === 'in-progress');
      const complete = tasks.length > 0 && tasks.every((task) => task.status === 'complete');
      if (started && !complete) {
        const memory = snapshot.files.find(
          (entry) =>
            entry.path === `${options.phase}/${PHASE_MEMORY_FILE}` &&
            (entry.kind ?? 'file') === 'file',
        )?.content;
        const brief = executionBriefStatus(memory ?? '');
        if (!brief.valid) {
          return yield* Effect.fail(
            phaseFailure(
              EXECUTION_BRIEF_MISSING_CODE,
              `${options.name}/${options.phase}/${PHASE_MEMORY_FILE}`,
              PHASE_MEMORY_FILE,
              brief.present
                ? `Phase '${options.phase}' has started but its execution brief does not name: ${brief.missing.join(', ')}.`
                : `Phase '${options.phase}' has started but its MEMORY.md has no execution brief.`,
              `mf-specs lock --name ${options.name} --phase ${options.phase}`,
              `Write the phase execution brief with the five labelled bullets (Read, Write scope, Gate, Record, Review), then confirm the lock.`,
            ),
          );
        }
      }
    }
    const blockers = new Set<string>(evidence.issues.map((found) => found.code ?? 'phase.issue'));
    for (const task of tasks) {
      if (task.status !== 'complete') blockers.add(`task.${task.status}`);
    }
    if (tasks.length === 0) blockers.add('task.pending');
    if (!evidence.proven.includes(options.phase)) blockers.add('gate.unproven');
    const reviewed = currentVersion
      ? reviewVerdict(
          options.name,
          {
            phase: options.phase,
            profiles: [
              ...new Set(
                tasks
                  .filter((task) => task.type === 'review')
                  .flatMap((task) => task.reviewerProfiles),
              ),
            ],
            budget: phaseReviewBudget(
              tasks.map((task) => ({ type: task.type, size: sizeOf(task) })),
            ),
            waived: evidence.waived.includes(options.phase),
          },
          review,
        ).passed
      : passedPhases(review).includes(options.phase);
    if (!currentVersion) {
      // A frozen v1 phase has no review decision record: only a closed round
      // can complete it, exactly as the pre-v2 lock rule read it.
      if (!reviewed) blockers.add('phase.review-missing');
      return {
        name: options.name,
        phase: options.phase,
        locked: blockers.size === 0,
        blockers: [...blockers].toSorted(),
      };
    }
    if (phase?.review === 'required') {
      if (!tasks.some((task) => task.type === 'review')) blockers.add('phase.review-missing');
      else if (!reviewed) blockers.add('phase.review-missing');
    } else if (phase?.review === 'none') {
      // A review-free phase locks on completion and gate proof alone.
    } else if (!evidence.waived.includes(options.phase)) {
      blockers.add('phase.waiver-unproven');
    }
    const locked = blockers.size === 0;
    return {
      name: options.name,
      phase: options.phase,
      locked,
      blockers: [...blockers].toSorted(),
    };
  });

/** Render a lock confirmation. */
export const renderLock = (report: LockReport): string =>
  report.locked
    ? `locked ${report.phase} · ${report.name}`
    : [
        `not locked ${report.phase} · ${report.name}`,
        ...report.blockers.map((code) => `  ${code}`),
      ].join('\n');

/** One waiver run's outcome. */
export interface WaiverReport {
  readonly name: string;
  readonly phase: string;
  readonly review: 'required' | 'waived';
  readonly evidence: ReadonlyArray<string>;
}

/** Options for {@link setWaiver}. */
export interface WaiverOptions extends PhaseVerbOptions {
  readonly waived: boolean;
  readonly reason?: string | undefined;
}

/** Stable codes for `waiver`. */
export const WAIVER_CODES = {
  noStages: 'waiver.no-stages',
  unclassifiedStage: 'waiver.unclassified-stage',
  invalidReason: 'waiver.invalid-reason',
  policy: 'waiver.waiver-policy',
  withReviewTask: 'phase.waiver-with-review-task',
  locked: 'phase.locked',
} as const;

/**
 * Set or clear a phase's review waiver. `--waived` recomputes `review-evidence`
 * from every classified stage in the phase and its task gates (phase first,
 * then task sort key, then stage number); `--required` clears reason and
 * evidence. No other byte of `PHASE.md` changes.
 * @param options - spec, phase, and the decision
 * @returns what was written
 */
export const setWaiver = (
  options: WaiverOptions,
): Effect.Effect<WaiverReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const { snapshot, specText } = yield* snapshotOf(options);
    yield* requireCurrentVersion(options, specText);
    const phasePath = `${options.phase}/${PHASE_FILE}`;
    const phaseText = snapshot.files.find(
      (entry) => entry.path === phasePath && (entry.kind ?? 'file') === 'file',
    )?.content;
    if (phaseText === undefined) {
      return yield* Effect.fail(
        phaseFailure(
          'phase.missing',
          `${options.name}/${options.phase}`,
          PHASE_FILE,
          `Phase '${options.phase}' has no ${PHASE_FILE}.`,
          `mf-specs migrate --name ${options.name}`,
        ),
      );
    }
    const phase = parsePhaseFile(phaseText);
    if (phase === undefined) {
      return yield* Effect.fail(
        phaseFailure(
          'phase.invalid',
          `${options.name}/${phasePath}`,
          PHASE_FILE,
          'The phase record is not readable, so its review fields cannot be rewritten.',
          `mf-specs check --name ${options.name}`,
        ),
      );
    }
    const tasks = tasksInPhase(snapshot, options.phase);
    const lock = yield* lockPhase(options, { requireBrief: false });
    if (lock.locked) {
      return yield* Effect.fail(
        phaseFailure(
          WAIVER_CODES.locked,
          `${options.name}/${phasePath}`,
          'review',
          `Phase '${options.phase}' is locked; its review decision is already settled.`,
          `mf-specs lock --name ${options.name} --phase ${options.phase}`,
          'A locked phase keeps its decision; a new phase owns new work.',
        ),
      );
    }
    if (options.waived) {
      if (tasks.some((task) => task.type === 'review')) {
        return yield* Effect.fail(
          phaseFailure(
            WAIVER_CODES.withReviewTask,
            `${options.name}/${phasePath}`,
            'review',
            'A waived phase must not hold a review task; a phase either reviews or waives.',
            `mf-specs check --name ${options.name}`,
            'Remove the review task, or keep the phase required.',
          ),
        );
      }
      if (!isReviewReason(options.reason)) {
        return yield* Effect.fail(
          phaseFailure(
            WAIVER_CODES.invalidReason,
            `${options.name}/${phasePath}`,
            'review-reason',
            'A waiver needs one non-placeholder reason.',
            `mf-specs waiver --name ${options.name} --phase ${options.phase} --waived --reason <line>`,
            'State in one line why the gates stand in for a review round.',
          ),
        );
      }
      const tier = tierOfSpec(specText);
      if (
        tier === undefined ||
        !waiverAllowed(
          tier,
          tasks.map((task) => task.type),
        )
      ) {
        return yield* Effect.fail(
          phaseFailure(
            WAIVER_CODES.policy,
            `${options.name}/${phasePath}`,
            'review',
            tier === undefined
              ? 'A v2 waiver needs the `## Creation` tier record; without it the waiver policy cannot be checked.'
              : tier === 'full'
                ? 'A full phase never waives review.'
                : 'A standard phase holding execution/defect/interruptor work is not records-only and cannot waive.',
            `mf-specs waiver --name ${options.name} --phase ${options.phase} --required`,
            tier === undefined
              ? 'Add the `## Creation` record (with its tier) before waiving, or keep the phase required.'
              : 'Keep the phase required; only records-only phases may waive.',
          ),
        );
      }
      const stages: Array<string> = [];
      const collect = (owner: string, gatesPath: string): SurfaceError | undefined => {
        const gatesText = snapshot.files.find(
          (entry) => entry.path === gatesPath && (entry.kind ?? 'file') === 'file',
        )?.content;
        if (gatesText === undefined) return undefined;
        for (const stage of parsePhaseGateStages(gatesText)) {
          if (stage.kind === undefined) {
            return phaseFailure(
              WAIVER_CODES.unclassifiedStage,
              `${options.name}/${gatesPath}`,
              'GATES.md',
              `Stage ${stage.stage} in '${gatesPath}' has no kind; a waiver needs classified evidence.`,
              `mf-specs check --name ${options.name}`,
              'Classify the stage as (mechanical) or (subjective), then waive.',
            );
          }
          stages.push(`${owner}:${stage.stage}`);
        }
        return undefined;
      };
      const phaseGateError = collect('phase', `${options.phase}/${PHASE_GATES_FILE}`);
      if (phaseGateError !== undefined) return yield* Effect.fail(phaseGateError);
      for (const task of tasks) {
        const error = collect(
          task.id,
          `${options.phase}/${task.id}-${task.name}/${PHASE_GATES_FILE}`,
        );
        if (error !== undefined) return yield* Effect.fail(error);
      }
      if (stages.length === 0) {
        return yield* Effect.fail(
          phaseFailure(
            WAIVER_CODES.noStages,
            `${options.name}/${phasePath}`,
            'review',
            'A phase with no classified gate stage cannot waive; there is no evidence to stand in for review.',
            `mf-specs new-task --name ${options.name} --phase ${options.phase} … --gates`,
            'Add a gate to the phase or its tasks, then waive.',
          ),
        );
      }
      const next = renderPhaseReview(phaseText, {
        review: 'waived',
        reason: options.reason ?? '',
        evidence: stages,
      });
      const store = yield* SpecStore.SpecStore;
      yield* store.write(options.root, options.name, [{ path: phasePath, content: next }]);
      return {
        name: options.name,
        phase: options.phase,
        review: 'waived',
        evidence: stages,
      };
    }
    const next = renderPhaseReview(phaseText, { review: 'required' });
    const store = yield* SpecStore.SpecStore;
    yield* store.write(options.root, options.name, [{ path: phasePath, content: next }]);
    return { name: options.name, phase: options.phase, review: 'required', evidence: [] };
  });

/** Render a waiver run. */
export const renderWaiver = (report: WaiverReport): string =>
  report.review === 'waived'
    ? `✓ waived review for ${report.phase} · ${report.name} · evidence ${report.evidence.join(', ')}`
    : `✓ required review for ${report.phase} · ${report.name} · reason and evidence cleared`;

// ─── Commands ─────────────────────────────────────────────────────────

/** `stamp`: the only clock. */
export const stampCommand = Command.make(
  'stamp',
  {
    format: Flag.optional(Flag.String('format')),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const requested = opt(config.format) ?? 'instant';
        if (requested !== 'instant' && requested !== 'date') {
          return yield* Effect.fail(
            new SurfaceError({
              operation: 'SpecStamp',
              diagnostics: [
                diagnostic({
                  code: SURFACE_CODES.invalidArgument,
                  path: 'stamp',
                  field: '--format',
                  problem: `Unknown stamp format '${requested}'.`,
                  rerun: 'mf-specs stamp',
                  expected: 'instant or date',
                  actual: requested,
                  fix: 'Pass --format instant, --format date, or omit the flag.',
                }),
              ],
            }),
          );
        }
        yield* Console.log(yield* stampValue(requested));
      }),
      () => ({ path: 'stamp', rerun: 'mf-specs stamp', verbose: false }),
    ),
).pipe(Command.withDescription('Print a UTC timestamp from the system clock.'));

/** `tier <tier>`: the one tier read path. */
export const tierCommand = Command.make(
  'tier',
  {
    tier: Argument.String('tier'),
    dir: dirFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(config.dir);
        const body = yield* readTier({ tier: config.tier, workspace });
        yield* Console.log(body);
      }).pipe(
        Effect.catchTag('@montflow/TierLoadError', (error) =>
          Effect.fail(
            new SurfaceError({
              operation: 'SpecTier',
              diagnostics: [
                diagnostic({
                  code: error.code,
                  path: error.path,
                  field: 'tier',
                  problem: error.problem,
                  rerun: `mf-specs tier ${config.tier}`,
                  expected: error.expected,
                  actual: error.actual,
                  fix: error.fix,
                }),
              ],
            }),
          ),
        ),
      ),
      () => ({ path: config.tier, rerun: `mf-specs tier ${config.tier}`, verbose: false }),
    ),
).pipe(Command.withDescription('Print one tier instruction file verbatim.'));

/** `lock`: confirm a derived phase lock. Writes nothing. */
export const lockCommand = Command.make(
  'lock',
  { dir: dirFlag, name: nameFlag, phase: Flag.String('phase') },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* lockPhase({
          root: storeDirOf(config.dir),
          name: config.name,
          phase: config.phase,
        });
        yield* Console.log(renderLock(report));
        if (!report.locked) {
          yield* Effect.sync(() => {
            process.exitCode = VALIDATION_EXIT_CODE;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs lock --name ${config.name} --phase ${config.phase}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Confirm a phase lock derived from completion, gates, and review.'),
  Command.provide(SpecStore.Default),
);

/** `waiver`: the generator for `PHASE.md` review decision and evidence. */
export const waiverCommand = Command.make(
  'waiver',
  {
    dir: dirFlag,
    name: nameFlag,
    phase: Flag.String('phase'),
    waived: Flag.Boolean('waived').pipe(Flag.withDefault(false)),
    required: Flag.Boolean('required').pipe(Flag.withDefault(false)),
    reason: Flag.optional(Flag.String('reason')),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        if (config.waived === config.required) {
          return yield* Effect.fail(
            new SurfaceError({
              operation: 'SpecWaiver',
              diagnostics: [
                diagnostic({
                  code: SURFACE_CODES.invalidArgument,
                  path: 'waiver',
                  field: '--waived/--required',
                  problem: 'Select exactly one of --waived or --required.',
                  rerun: `mf-specs waiver --name ${config.name} --phase ${config.phase} --waived --reason <line>`,
                  expected: '--waived --reason <line>, or --required',
                  actual: config.waived ? 'both' : 'neither',
                  fix: 'Pass exactly one decision flag.',
                }),
              ],
            }),
          );
        }
        const report = yield* setWaiver({
          root: storeDirOf(config.dir),
          name: config.name,
          phase: config.phase,
          waived: config.waived,
          reason: opt(config.reason),
        });
        yield* Console.log(renderWaiver(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs waiver --name ${config.name} --phase ${config.phase}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Write a phase review waiver decision and its gate evidence.'),
  Command.provide(SpecStore.Default),
);
