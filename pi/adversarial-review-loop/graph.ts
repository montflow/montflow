import { Console, Effect, Option, Result } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import {
  buildReviewerSystem,
  FIXER_SYSTEM,
  RECONCILIATOR_SYSTEM,
  SUPERVISOR_SYSTEM,
  TOOLS,
} from './agents';
import {
  createPersistentAgent,
  runAgent,
  type AgentRunError,
  type AgentRunResult,
  type PersistentAgent,
} from './runner';
import { parseSummary, isAllTerminal, type SummaryCounts } from './parse-summary';
import { resolveReviewFile } from './resolve-review-file';
import { verifyLoopSkills, type SkillVerificationError } from './verify-skill';
import { FIXER_SKILL_PATH } from './skill-paths';
import {
  loadFeatureSpec,
  findActivePhase,
  getReviewLoopCounter,
  updateReviewLoopCounter,
  extractFindings,
  createRemediationTasks,
  updateFeatureTaskTable,
  executeRemediations,
  type ActivePhase,
  type FeatureSpec,
  type FeatureSpecError,
  type FeatureSpecValidationError,
} from './feature-spec';
import type { LoopConfig, ReviewerProfile } from './config';
import { defaultLoopConfig, usesSupervisor } from './config';
import {
  briefPath,
  ensurePassDirs,
  ensureStateDirs,
  loadLoopState,
  passScratchPath,
  saveLoopState,
  scratchPath,
  type LoopState,
} from './loop-state';
import { mergeScratchReports, passthroughMerge, type ScratchReport } from './merge';
import { applyDeadlockDetection } from './deadlock';
import { parseFindingBlocks } from './findings';
import {
  clearLoopWidget,
  setLoopWidget,
  type FixerWidgetStatus,
  type LoopWidgetState,
  type ReconcileWidgetStatus,
  type ReviewerWidgetRow,
  type SupervisorWidgetStatus,
  type WidgetUi,
} from './widget';

export const MAX_CONSECUTIVE_FAILURES = 2;

export const REVIEWER_TIMEOUT = 900000;

export const FIXER_TIMEOUT = 600000;

export const RECONCILIATOR_TIMEOUT = 600000;

export const SUPERVISOR_TIMEOUT = 600000;

export const MAX_REVIEW_LOOP_ITERATIONS = 5;

export interface LoopOptions {
  readonly reviewerModel: string;
  readonly fixerModel: string;
  readonly maxLoops: number;
  readonly targetDir: string;
  readonly reviewName: string;
  readonly fresh: boolean;
  readonly featureSpec: boolean;
  readonly specName: string;
  readonly config: LoopConfig;
  /** Human-readable scope description injected into reviewer tasks (interactive mode). */
  readonly reviewScope?: string;
  /** Files/directories in scope (when known from interactive setup). */
  readonly scopeFiles?: readonly string[];
  /** Absolute path to a materialized diff file (git-unstaged scope). */
  readonly scopeDiffPath?: string;
}

export interface Ui extends WidgetUi {
  readonly setStatus: (id: string, text: string | undefined) => void;
  readonly notify: (message: string, level: 'info' | 'warning' | 'error') => void;
}

export interface FeatureSpecCtx {
  readonly spec: FeatureSpec;
  readonly phase: ActivePhase;
}

export type Terminal = 'done' | 'failed' | 'escalated' | 'maxLoops' | 'reviewCap';

export interface GraphCtx {
  readonly opts: LoopOptions;
  readonly cwd: string;
  readonly ui: Ui;
  readonly validateFeatureSpecFromBranch: (
    cwd: string,
  ) => Effect.Effect<string, FeatureSpecValidationError, FileSystem | Path>;
  readonly reviewFile?: string;
  readonly reReview?: boolean;
  readonly featureSpecCtx?: FeatureSpecCtx | null;
  readonly cycle?: number;
  readonly reviewerConsecutiveFailures?: number;
  readonly fixerConsecutiveFailures?: number;
  readonly summary?: Option.Option<SummaryCounts>;
  readonly terminal?: Terminal;
  readonly loopState?: LoopState;
  readonly widget?: LoopWidgetState;
  /** Persistent supervisor session for the whole loop (multi-reviewer / always mode). */
  readonly supervisor?: PersistentAgent;
  /**
   * Mutable holder updated eagerly at supervisor creation, so the session
   * stays reachable for disposal even when a defect escapes a node before the
   * new ctx (with `supervisor` set) is returned.
   */
  readonly supervisorHolder?: { current?: PersistentAgent };
}

export interface NodeResult {
  readonly next: string | null;
  readonly ctx: GraphCtx;
}

/** Errors that can escape a graph node into runGraph's top-level handler. */
type NodeError =
  | SkillVerificationError
  | FeatureSpecError
  | FeatureSpecValidationError
  | AgentRunError
  | PlatformError;

export interface GraphDeps {
  readonly verifySkill?: () => Effect.Effect<void, SkillVerificationError, FileSystem>;
  readonly runAgent?: typeof runAgent;
  readonly createPersistentAgent?: typeof createPersistentAgent;
  readonly executeRemediations?: typeof executeRemediations;
}

type GraphNode = (
  ctx: GraphCtx,
  deps: GraphDeps,
) => Effect.Effect<NodeResult, NodeError, FileSystem | Path>;

const STATUS_KEY = 'adversarial-review-loop';

/**
 * Emits a Pi UI notification as an effect.
 * @param {Ui} ui The Pi UI handle
 * @param {string} message The message to show
 * @param {'info' | 'warning' | 'error'} level The notification level
 * @returns An effect performing the notification
 */
const notify = (
  ui: Ui,
  message: string,
  level: 'info' | 'warning' | 'error',
): Effect.Effect<void> => Effect.sync(() => ui.notify(message, level));

/**
 * Sets the loop's Pi UI status line as an effect.
 * @param {Ui} ui The Pi UI handle
 * @param {string | undefined} text The status text, or undefined to clear
 * @returns An effect performing the status update
 */
const setStatus = (ui: Ui, text: string | undefined): Effect.Effect<void> =>
  Effect.sync(() => ui.setStatus(STATUS_KEY, text));

/**
 * Builds a status line for the Pi UI.
 * @param {number} cycle Current cycle
 * @param {number} total Max cycles
 * @param {string} phase Current phase label
 * @param {string} status Current status label
 * @returns The formatted status line
 */
export const statusLine = (cycle: number, total: number, phase: string, status: string): string =>
  `● adversarial-review-loop [${cycle}/${total}] ${phase}: ${status}`;

/**
 * Pure transition after a successful reviewer turn + summary parse.
 * @param {{ summary: Option.Option<SummaryCounts>, featureSpec: boolean }} input Review outcome
 * @returns The next transition name
 */
export const transitionAfterReview = (input: {
  readonly summary: Option.Option<SummaryCounts>;
  readonly featureSpec: boolean;
}): 'done' | 'escalated' | 'featureRemediate' | 'fixer' => {
  const { summary, featureSpec } = input;
  if (isAllTerminal(summary)) return 'done';
  if (
    Option.isSome(summary) &&
    summary.value.open === 0 &&
    summary.value.inReview === 0 &&
    summary.value.escalated > 0
  ) {
    return 'escalated';
  }
  if (featureSpec) return 'featureRemediate';
  return 'fixer';
};

/**
 * Pure transition after a fixer turn.
 * @param {{ cycle: number, maxLoops: number }} input Loop counters
 * @returns The next transition name
 */
export const transitionAfterFixer = (input: {
  readonly cycle: number;
  readonly maxLoops: number;
}): 'review' | 'maxLoops' => (input.cycle < input.maxLoops ? 'review' : 'maxLoops');

/**
 * Reads a file's mtime in milliseconds, or none when the file is missing/unreadable.
 * @param {FileSystem} fileSystem The FileSystem service
 * @param {string} filePath Absolute path to the file
 * @returns The mtime in ms since epoch, or none
 */
const mtimeMs = (
  fileSystem: FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<number>> =>
  fileSystem.stat(filePath).pipe(
    Effect.map((info) => Option.map(info.mtime, (date) => date.getTime())),
    Effect.orElseSucceed(Option.none<number>),
  );

/**
 * True when the file's mtime advanced past the captured pre-run mtime.
 * @param {Option.Option<number>} post Mtime after the agent turn
 * @param {Option.Option<number>} pre Mtime before the agent turn
 * @returns True when the file was touched during the turn
 */
const fileAdvanced = (post: Option.Option<number>, pre: Option.Option<number>): boolean =>
  Option.isSome(post) && post.value > Option.getOrElse(pre, () => 0);

/**
 * Resolves the effective loop config from options (defaults if omitted).
 * @param {LoopOptions} opts Loop options
 * @returns The loop config
 */
const configOf = (opts: LoopOptions): LoopConfig => opts.config ?? defaultLoopConfig();

/**
 * Builds initial widget rows for the roster.
 * @param {readonly ReviewerProfile[]} reviewers Reviewer roster
 * @returns Widget rows
 */
const initialReviewerRows = (
  reviewers: readonly ReviewerProfile[],
): ReviewerWidgetRow[] =>
  reviewers.map((profile) => ({
    id: profile.id,
    label: profile.label,
    status: 'pending' as const,
  }));

/**
 * Publishes widget + status from the current graph context.
 * @param {GraphCtx} ctx Graph context
 * @param {Partial<LoopWidgetState>} patch Widget fields to update
 * @returns Updated context
 */
const withWidget = (
  ctx: GraphCtx,
  patch: Partial<LoopWidgetState> & { readonly phase?: string },
): GraphCtx => {
  const config = configOf(ctx.opts);
  const base: LoopWidgetState = ctx.widget ?? {
    cycle: ctx.cycle ?? 0,
    maxLoops: config.maxLoops,
    supervisor: usesSupervisor(config) ? 'idle' : 'skipped',
    reviewers: initialReviewerRows(config.reviewers),
    reconcile: 'idle',
    fixer: 'waiting',
    summary: ctx.summary ?? Option.none(),
    deadlocks: ctx.loopState?.deadlocks.length ?? 0,
    phase: 'starting',
  };
  const widget: LoopWidgetState = {
    ...base,
    cycle: patch.cycle ?? base.cycle,
    maxLoops: patch.maxLoops ?? base.maxLoops,
    supervisor: patch.supervisor ?? base.supervisor,
    supervisorDetail: patch.supervisorDetail ?? base.supervisorDetail,
    reviewers: patch.reviewers ?? base.reviewers,
    reconcile: patch.reconcile ?? base.reconcile,
    reconcileDetail: patch.reconcileDetail ?? base.reconcileDetail,
    fixer: patch.fixer ?? base.fixer,
    summary: patch.summary ?? base.summary,
    deadlocks: patch.deadlocks ?? base.deadlocks,
    phase: patch.phase ?? base.phase,
  };
  setLoopWidget(ctx.ui, widget);
  return { ...ctx, widget };
};

/**
 * Skill gate: verify every skill the resolved config can dispatch exists
 * (core skills also meet version floors).
 */
const skillGate: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const verify = deps.verifySkill ?? (() => verifyLoopSkills(configOf(ctx.opts)));
    const check = yield* Effect.result(verify());
    if (Result.isFailure(check)) {
      yield* notify(ctx.ui, check.failure.message, 'error');
      return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
    }
    yield* notify(
      ctx.ui,
      '[adversarial-review-loop] Verified: all skills referenced by the resolved config are present.',
      'info',
    );
    return { next: 'resolveCtx', ctx };
  });

/**
 * Resolve review file path and optional feature-spec context.
 */
const resolveCtx: GraphNode = (ctx) =>
  Effect.gen(function* () {
    const { opts, cwd, ui } = ctx;
    const config = configOf(opts);
    let featureSpecCtx: FeatureSpecCtx | null = null;

    if (opts.featureSpec) {
      let specName = opts.specName;
      if (specName === '') {
        const validation = yield* Effect.result(ctx.validateFeatureSpecFromBranch(cwd));
        if (Result.isFailure(validation)) {
          yield* notify(ui, validation.failure.message, 'error');
          return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
        }
        specName = validation.success;
        yield* notify(
          ui,
          `[adversarial-review-loop] Detected feature from branch: feat/${specName}`,
          'info',
        );
      }

      const loadResult = yield* Effect.result(loadFeatureSpec(cwd, specName));
      if (Result.isFailure(loadResult)) {
        yield* notify(ui, loadResult.failure.message, 'error');
        return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
      }

      const spec = loadResult.success;
      const activePhase = yield* findActivePhase(spec, spec.lockedPhases);
      if (activePhase === null) {
        yield* notify(
          ui,
          `[adversarial-review-loop] No active phase found for feature '${specName}'. All phases may be complete or locked.`,
          'warning',
        );
        return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
      }
      if (activePhase.reviewTask === null) {
        yield* notify(
          ui,
          `[adversarial-review-loop] Active phase ${activePhase.phase} has no review task. Cannot run feature-spec mode.`,
          'error',
        );
        return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
      }
      featureSpecCtx = { spec, phase: activePhase };
      yield* notify(
        ui,
        `[adversarial-review-loop] Feature-spec mode: '${specName}', active phase=${activePhase.phase}, review task=${activePhase.reviewTask.id}`,
        'info',
      );
    }

    const resolvedReviewFile =
      featureSpecCtx?.phase.reviewTask?.reviewFile ??
      (yield* resolveReviewFile(cwd, opts.reviewName, opts.fresh));

    yield* ensureStateDirs(resolvedReviewFile);

    const fileSystem = yield* FileSystem;
    const reviewFileExists = yield* fileSystem
      .exists(resolvedReviewFile)
      .pipe(Effect.orElseSucceed(() => false));
    const reReview = reviewFileExists && !opts.fresh;

    const loopState = yield* loadLoopState(
      resolvedReviewFile,
      config.reviewers.map((profile) => profile.id),
    );

    // Programmatic early exit: resumed all-terminal file needs no agent calls.
    if (reReview) {
      const existingSummary = yield* parseSummary(resolvedReviewFile);
      if (isAllTerminal(existingSummary)) {
        yield* notify(
          ui,
          '[adversarial-review-loop] Existing review is already all-terminal — nothing to do.',
          'info',
        );
        yield* setStatus(ui, '● adversarial-review-loop DONE');
        clearLoopWidget(ui);
        return {
          next: null,
          ctx: {
            ...ctx,
            reviewFile: resolvedReviewFile,
            reReview,
            featureSpecCtx,
            loopState,
            summary: existingSummary,
            terminal: 'done' as const,
          },
        };
      }
    }

    const rosterLabel = config.reviewers.map((profile) => profile.id).join(',');
    const supervisorLabel = usesSupervisor(config)
      ? `supervisor=${config.supervisor.mode}`
      : 'supervisor=skipped';
    const scopeLabel =
      opts.reviewScope !== undefined && opts.reviewScope.trim() !== ''
        ? ` scope="${opts.reviewScope.trim().slice(0, 80)}"`
        : '';
    yield* setStatus(ui, '● starting');
    yield* notify(
      ui,
      `[adversarial-review-loop] file=${resolvedReviewFile} reReview=${reReview} ` +
        `reviewers=${rosterLabel} fixer=${config.fixerModel} ` +
        `depth=${config.maxLoops} dir=${opts.targetDir} ${supervisorLabel} ` +
        `reconcile=${config.reconciliator.mode}${scopeLabel}`,
      'info',
    );

    let nextCtx: GraphCtx = {
      ...ctx,
      reviewFile: resolvedReviewFile,
      reReview,
      featureSpecCtx,
      cycle: 0,
      reviewerConsecutiveFailures: 0,
      fixerConsecutiveFailures: 0,
      loopState,
    };
    nextCtx = withWidget(nextCtx, {
      cycle: 0,
      maxLoops: config.maxLoops,
      supervisor: usesSupervisor(config) ? 'idle' : 'skipped',
      reviewers: initialReviewerRows(config.reviewers),
      reconcile: 'idle',
      fixer: 'waiting',
      phase: 'starting',
      deadlocks: loopState.deadlocks.length,
    });

    return { next: 'review', ctx: nextCtx };
  });

/**
 * Builds the scope clause for reviewer tasks: materialized diff path, explicit
 * file list, and/or a free-form scope description. Empty when no scope is set
 * (flag-driven runs keep reviewing the whole target directory).
 * @param {LoopOptions} opts Loop options
 * @returns The scope clause text
 */
export const buildScopeClause = (opts: LoopOptions): string => {
  const parts: string[] = [];
  if (opts.scopeDiffPath !== undefined && opts.scopeDiffPath !== '') {
    parts.push(
      `Read the diff at ${opts.scopeDiffPath} — review ONLY the changes it contains, not the whole codebase.`,
    );
  }
  if (opts.scopeFiles !== undefined && opts.scopeFiles.length > 0) {
    parts.push(`Scope — focus on these files/directories: ${opts.scopeFiles.join(', ')}.`);
  }
  if (opts.reviewScope !== undefined && opts.reviewScope.trim() !== '') {
    parts.push(`Scope — ${opts.reviewScope.trim()}`);
  }
  return parts.join(' ');
};

/**
 * Builds the reviewer task prompt for a profile.
 * @param {GraphCtx} ctx The current graph context
 * @param {ReviewerProfile} profile Reviewer profile
 * @param {string} outputPath Where this reviewer should write
 * @param {string | undefined} [briefFile] Optional supervisor brief path
 * @returns The reviewer task prompt
 */
const buildReviewerTask = (
  ctx: GraphCtx,
  profile: ReviewerProfile,
  outputPath: string,
  briefFile?: string,
): string => {
  const { opts, reviewFile, reReview, cycle = 0 } = ctx;
  const skillPath = profile.skillPath;
  const objective = profile.objective;
  const briefClause =
    briefFile !== undefined
      ? `Read the supervisor brief at ${briefFile} and obey your assignment for id=${profile.id}. `
      : '';
  const scopeClause = buildScopeClause(opts);

  if (cycle === 1 && !reReview) {
    return (
      `Perform a thorough adversarial review of ${opts.targetDir}. ` +
      briefClause +
      (scopeClause !== '' ? `${scopeClause} ` : '') +
      `Your objective: ${objective}. ` +
      `Load and follow the adversarial-review skill at ${skillPath}; ` +
      `write the report to ${outputPath} using its standard file structure. ` +
      `Stamp each finding with \`- **Source**: ${profile.id}\`. ` +
      'You are read-only on application source — write only the review markdown. ' +
      'Audit Steps 2–7 of the skill through your objective lens; lead with the highest-severity findings. ' +
      'If no defects are found, state "No defects found." and list coverage areas. ' +
      'Do not decide whether another cycle should run.'
    );
  }

  return (
    `Re-review the existing review file at ${reviewFile} by executing ` +
    `Step 9 of the adversarial-review skill at ${skillPath}. ` +
    briefClause +
    (scopeClause !== '' ? `${scopeClause} ` : '') +
    `Your objective: ${objective}. ` +
    `Write your updated report to ${outputPath} (may equal the canonical file). ` +
    'You are read-only on application source — write only the review markdown. ' +
    'Read the canonical review file; scope to non-terminal findings (Open, In Review, Escalated ' +
    'only if a [Human] turn resolved the escalation); verify each In Review finding ' +
    `against the actual code at ${opts.targetDir} (never trust [Fixer] turns as evidence); ` +
    'hunt Steps 2–7 for regressions within your objective; bump Iteration; append [Reviewer] turns; ' +
    `stamp Source as ${profile.id} on new findings. Do NOT touch Attempts. ` +
    'Do not decide whether another cycle should run.'
  );
};

/**
 * Runs one fresh reviewer agent (never persisted across cycles).
 * @param {GraphCtx} ctx Graph context
 * @param {GraphDeps} deps Injectable deps
 * @param {ReviewerProfile} profile Reviewer profile
 * @param {string} outputPath Output path for this reviewer
 * @param {string | undefined} [briefFile] Optional supervisor brief path
 * @returns Agent run result
 */
const runFreshReviewer = (
  ctx: GraphCtx,
  deps: GraphDeps,
  profile: ReviewerProfile,
  outputPath: string,
  briefFile?: string,
): Effect.Effect<AgentRunResult, never> =>
  Effect.gen(function* () {
    const run = deps.runAgent ?? runAgent;
    const task = buildReviewerTask(ctx, profile, outputPath, briefFile);
    const outcome = yield* Effect.result(
      run(
        {
          model: profile.model,
          systemPrompt: buildReviewerSystem(profile),
          task,
          tools: TOOLS.reviewer,
          cwd: ctx.cwd,
        },
        REVIEWER_TIMEOUT,
      ),
    );
    return Result.isFailure(outcome)
      ? { text: '', error: outcome.failure.message }
      : outcome.success;
  });

/**
 * Ensures a persistent supervisor agent exists on the graph context.
 * @param {GraphCtx} ctx Graph context
 * @param {GraphDeps} deps Injectable deps
 * @param {LoopConfig} config Loop config
 * @returns Context with supervisor attached
 */
const ensureSupervisor = (
  ctx: GraphCtx,
  deps: GraphDeps,
  config: LoopConfig,
): Effect.Effect<GraphCtx, AgentRunError> =>
  Effect.gen(function* () {
    if (ctx.supervisor !== undefined) return ctx;
    const create = deps.createPersistentAgent ?? createPersistentAgent;
    const supervisor = yield* create(
      {
        model: config.supervisor.model,
        systemPrompt: SUPERVISOR_SYSTEM,
        tools: TOOLS.supervisor,
        cwd: ctx.cwd,
      },
      SUPERVISOR_TIMEOUT,
    );
    // Register eagerly: if a defect escapes before the new ctx is returned,
    // runGraph's ensuring can still dispose via the holder.
    const holder = ctx.supervisorHolder;
    if (holder !== undefined) holder.current = supervisor;
    return { ...ctx, supervisor };
  });

/**
 * Builds the supervisor brief-turn task.
 * @param {GraphCtx} ctx Graph context
 * @param {LoopConfig} config Loop config
 * @param {string} briefFile Brief output path
 * @param {number} cycle Cycle number
 * @returns Task prompt
 */
const buildSupervisorBriefTask = (
  ctx: GraphCtx,
  config: LoopConfig,
  briefFile: string,
  cycle: number,
): string => {
  const rosterBlock = config.reviewers
    .map(
      (profile) =>
        `- id=${profile.id} label=${profile.label} objective=${profile.objective} ` +
        `skill=${profile.skillPath} scratch=${passScratchPath(ctx.reviewFile!, cycle, profile.id)}`,
    )
    .join('\n');
  const scopeClause = buildScopeClause(ctx.opts);

  return (
    `BRIEF TURN (cycle ${cycle}).\n` +
    `Target directory: ${ctx.opts.targetDir}\n` +
    (scopeClause !== '' ? `Scope: ${scopeClause}\n` : '') +
    `Canonical review file: ${ctx.reviewFile}\n` +
    `Re-review: ${ctx.reReview || cycle > 1 ? 'yes' : 'no'}\n` +
    `Write the pass brief to: ${briefFile}\n` +
    `Roster (user-selected — do not add/remove):\n${rosterBlock}\n` +
    'Follow the supervisor skill Turn A. Do not write the canonical review yet.'
  );
};

/**
 * Builds the supervisor aggregate-turn task.
 * @param {GraphCtx} ctx Graph context
 * @param {LoopConfig} config Loop config
 * @param {string} briefFile Brief path
 * @param {number} cycle Cycle number
 * @param {readonly string[]} scratchFiles Scratch paths that exist
 * @returns Task prompt
 */
const buildSupervisorAggregateTask = (
  ctx: GraphCtx,
  config: LoopConfig,
  briefFile: string,
  cycle: number,
  scratchFiles: readonly string[],
): string =>
  (
    `AGGREGATE TURN (cycle ${cycle}).\n` +
    `Brief: ${briefFile}\n` +
    `Scratch reports:\n${scratchFiles.map((path) => `- ${path}`).join('\n')}\n` +
    `Canonical review (overwrite): ${ctx.reviewFile}\n` +
    `Target: ${ctx.opts.targetDir}\n` +
    `Roster ids: ${config.reviewers.map((profile) => profile.id).join(', ')}\n` +
    'Follow the supervisor skill Turn B. Deduplicate, resolve conflicts, preserve terminals, ' +
    'refresh Summary. You may join common issues or add rare cross-cutting findings. ' +
    'Do not decide loop continue/stop.'
  );

/**
 * Fan-out reviewers → (supervisor aggregate | programmatic merge) → deadlock check.
 */
const review: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const { opts, ui, reviewFile } = ctx;
    if (reviewFile === undefined) {
      yield* notify(ui, 'Internal error: reviewFile not resolved', 'error');
      return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
    }

    const config = configOf(opts);
    const fileSystem = yield* FileSystem;
    const cycle = (ctx.cycle ?? 0) + 1;
    const supervised = usesSupervisor(config);
    let runningCtx: GraphCtx = { ...ctx, cycle };
    const supervisorStatus: SupervisorWidgetStatus = supervised ? 'idle' : 'skipped';

    runningCtx = withWidget(runningCtx, {
      cycle,
      maxLoops: config.maxLoops,
      supervisor: supervisorStatus,
      reviewers: initialReviewerRows(config.reviewers),
      reconcile: 'idle',
      fixer: 'waiting',
      phase: supervised ? 'supervisor:brief' : 'reviewers',
      deadlocks: runningCtx.loopState?.deadlocks.length ?? 0,
    });

    yield* setStatus(
      ui,
      statusLine(cycle, config.maxLoops, supervised ? 'supervisor' : 'reviewers', 'running'),
    );
    yield* Console.log(
      `\n[adversarial-review-loop] Cycle ${cycle}/${config.maxLoops} — ` +
        (supervised ? 'Supervisor pass + ' : '') +
        `Reviewers [${config.reviewers.map((profile) => profile.id).join(', ')}] ` +
        (cycle === 1 && !ctx.reReview ? '(fresh review)' : '(re-review)'),
    );

    yield* ensureStateDirs(reviewFile);

    let briefFile: string | undefined;
    if (supervised) {
      yield* ensurePassDirs(reviewFile, cycle);
      briefFile = briefPath(reviewFile, cycle);

      const ensured = yield* Effect.result(ensureSupervisor(runningCtx, deps, config));
      if (Result.isFailure(ensured)) {
        yield* notify(ui, `Supervisor create failed: ${ensured.failure.message}`, 'error');
        clearLoopWidget(ui);
        return {
          next: null,
          ctx: { ...runningCtx, terminal: 'failed' as const },
        };
      }
      runningCtx = ensured.success;

      runningCtx = withWidget(runningCtx, {
        supervisor: 'briefing',
        phase: 'supervisor:brief',
      });
      yield* setStatus(ui, statusLine(cycle, config.maxLoops, 'supervisor:brief', 'running'));

      const briefSupervisor = runningCtx.supervisor;
      if (briefSupervisor === undefined) {
        yield* notify(ui, 'Supervisor session missing after create', 'error');
        clearLoopWidget(ui);
        return { next: null, ctx: { ...runningCtx, terminal: 'failed' as const } };
      }

      const preBrief = yield* mtimeMs(fileSystem, briefFile);
      const briefResult = yield* briefSupervisor.prompt(
        buildSupervisorBriefTask(runningCtx, config, briefFile, cycle),
        SUPERVISOR_TIMEOUT,
      );
      const postBrief = yield* mtimeMs(fileSystem, briefFile);
      // The brief must exist and be non-empty before specialists fan out —
      // a supervisor that finishes without error but never writes the brief
      // (or errors after a partial write) must not dispatch unbriefed
      // specialists (DESIGN-pass-supervisor.md: "do not run specialists
      // without a brief when mode=always").
      const briefContent = yield* fileSystem
        .readFileString(briefFile, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));
      const briefMissing = briefContent.trim() === '';
      if ((briefResult.error !== undefined && !fileAdvanced(postBrief, preBrief)) || briefMissing) {
        yield* notify(
          ui,
          briefMissing && briefResult.error === undefined
            ? 'Supervisor brief missing or empty after brief turn — refusing to fan out specialists without scope.'
            : `Supervisor brief error: ${briefResult.error ?? 'brief file empty or missing'}`,
          'error',
        );
        const failures = (runningCtx.reviewerConsecutiveFailures ?? 0) + 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          clearLoopWidget(ui);
          return {
            next: null,
            ctx: {
              ...runningCtx,
              reviewerConsecutiveFailures: failures,
              terminal: 'failed' as const,
            },
          };
        }
        return {
          next: 'review',
          ctx: { ...runningCtx, reviewerConsecutiveFailures: failures },
        };
      }

      runningCtx = withWidget(runningCtx, {
        supervisor: 'waiting-specialists',
        phase: 'reviewers',
      });
    }

    const singleReviewer = !supervised && config.reviewers.length === 1;
    const reports: ScratchReport[] = [];
    let reviewerRows = initialReviewerRows(config.reviewers);
    let anySuccess = false;
    let failures = runningCtx.reviewerConsecutiveFailures ?? 0;
    const scratchFiles: string[] = [];

    for (const [index, profile] of config.reviewers.entries()) {
      const outputPath = supervised
        ? passScratchPath(reviewFile, cycle, profile.id)
        : singleReviewer
          ? reviewFile
          : scratchPath(reviewFile, profile.id);
      reviewerRows = reviewerRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, status: 'running' as const } : row,
      );
      runningCtx = withWidget(runningCtx, {
        reviewers: reviewerRows,
        phase: `reviewer:${profile.id}`,
      });
      yield* setStatus(
        ui,
        statusLine(cycle, config.maxLoops, `reviewer:${profile.id}`, 'running'),
      );

      const preMtime = yield* mtimeMs(fileSystem, outputPath);
      const result = yield* runFreshReviewer(
        runningCtx,
        deps,
        profile,
        outputPath,
        briefFile,
      );
      const postMtime = yield* mtimeMs(fileSystem, outputPath);
      const wrote = fileAdvanced(postMtime, preMtime);

      if (result.error !== undefined && !wrote) {
        yield* notify(ui, `Reviewer ${profile.id} error: ${result.error}`, 'error');
        reviewerRows = reviewerRows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, status: 'error' as const } : row,
        );
        runningCtx = withWidget(runningCtx, { reviewers: reviewerRows });
        continue;
      }

      if (result.error !== undefined && wrote) {
        yield* Console.log(
          `[adversarial-review-loop] Reviewer ${profile.id} reported error but file updated — assuming success.`,
        );
      }

      const content = yield* fileSystem
        .readFileString(outputPath, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));
      const findingCount = parseFindingBlocks(content).length;
      reports.push({ reviewerId: profile.id, content });
      scratchFiles.push(outputPath);
      anySuccess = true;
      reviewerRows = reviewerRows.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, status: 'done' as const, findingCount }
          : row,
      );
      runningCtx = withWidget(runningCtx, { reviewers: reviewerRows });
    }

    if (!anySuccess) {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        yield* notify(
          ui,
          `Reviewer failed ${failures} consecutive times. Escalating to human.`,
          'error',
        );
        yield* setStatus(ui, '● adversarial-review-loop FAILED');
        clearLoopWidget(ui);
        return {
          next: null,
          ctx: {
            ...runningCtx,
            reviewerConsecutiveFailures: failures,
            terminal: 'failed' as const,
          },
        };
      }
      return {
        next: 'review',
        ctx: { ...runningCtx, reviewerConsecutiveFailures: failures },
      };
    }

    // ── Aggregate / merge ──
    let canonicalMarkdown: string;
    let reconcile: ReconcileWidgetStatus = 'programmatic';
    let reconcileDetail: string | undefined;

    const supervisorAgent = runningCtx.supervisor;
    if (supervised && briefFile !== undefined && supervisorAgent !== undefined) {
      runningCtx = withWidget(runningCtx, {
        supervisor: 'aggregating',
        reconcile: 'skipped',
        reconcileDetail: 'supervisor aggregate',
        phase: 'supervisor:aggregate',
      });
      yield* setStatus(
        ui,
        statusLine(cycle, config.maxLoops, 'supervisor:aggregate', 'running'),
      );
      yield* Console.log(
        `[adversarial-review-loop] Cycle ${cycle}/${config.maxLoops} — Supervisor aggregate`,
      );

      const preAgg = yield* mtimeMs(fileSystem, reviewFile);
      const aggResult = yield* supervisorAgent.prompt(
        buildSupervisorAggregateTask(runningCtx, config, briefFile, cycle, scratchFiles),
        SUPERVISOR_TIMEOUT,
      );
      const postAgg = yield* mtimeMs(fileSystem, reviewFile);
      canonicalMarkdown = yield* fileSystem
        .readFileString(reviewFile, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));

      if (
        (aggResult.error !== undefined && !fileAdvanced(postAgg, preAgg)) ||
        canonicalMarkdown.trim() === ''
      ) {
        yield* notify(
          ui,
          `Supervisor aggregate failed (${aggResult.error ?? 'empty canonical'}) — falling back to programmatic merge.`,
          'warning',
        );
        const existingCanonical = yield* fileSystem
          .readFileString(reviewFile, 'utf8')
          .pipe(Effect.orElseSucceed(() => ''));
        const merged = mergeScratchReports({
          reports,
          target: opts.targetDir,
          reviewFile,
          iteration: cycle,
          existingCanonical: ctx.reReview || cycle > 1 ? existingCanonical : undefined,
        });
        canonicalMarkdown = merged.canonicalMarkdown;
        reconcile = 'done';
        reconcileDetail = 'supervisor failed; programmatic fallback';
      } else {
        reconcile = 'skipped';
        reconcileDetail = 'supervisor aggregate';
      }
      runningCtx = withWidget(runningCtx, {
        supervisor: 'done',
        reconcile,
        reconcileDetail,
        phase: 'merge',
      });
    } else if (singleReviewer) {
      const only = reports[0]?.content ?? '';
      canonicalMarkdown = passthroughMerge(only).canonicalMarkdown;
      reconcile = 'skipped';
      reconcileDetail = 'single reviewer';
      runningCtx = withWidget(runningCtx, {
        supervisor: 'skipped',
        reconcile,
        reconcileDetail,
        phase: 'merge',
      });
    } else {
      runningCtx = withWidget(runningCtx, {
        supervisor: 'skipped',
        reconcile: 'programmatic',
        phase: 'merge',
      });
      const existingCanonical = yield* fileSystem
        .readFileString(reviewFile, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));
      const merged = mergeScratchReports({
        reports,
        target: opts.targetDir,
        reviewFile,
        iteration: cycle,
        existingCanonical: ctx.reReview || cycle > 1 ? existingCanonical : undefined,
      });
      canonicalMarkdown = merged.canonicalMarkdown;
      reconcileDetail = merged.hadConflicts
        ? `${merged.conflicts.length} conflict(s)`
        : 'no conflicts';

      const needsLlm =
        merged.hadConflicts &&
        (config.reconciliator.mode === 'on-conflict' || config.reconciliator.mode === 'always');
      const alwaysLlm = config.reconciliator.mode === 'always';

      if (needsLlm || alwaysLlm) {
        yield* fileSystem
          .writeFileString(reviewFile, canonicalMarkdown)
          .pipe(Effect.orElseSucceed(() => undefined));
        runningCtx = withWidget(runningCtx, {
          reconcile: 'llm',
          reconcileDetail,
          phase: 'reconciliator',
        });
        yield* setStatus(ui, statusLine(cycle, config.maxLoops, 'reconciliator', 'running'));
        yield* Console.log(
          `[adversarial-review-loop] Cycle ${cycle}/${config.maxLoops} — LLM reconciliator (${reconcileDetail})`,
        );

        const conflictNotes = merged.conflicts
          .map(
            (conflict) =>
              `- ${conflict.fingerprint}: ${conflict.reason} (${conflict.findings.map((finding) => finding.id).join(', ')})`,
          )
          .join('\n');
        const run = deps.runAgent ?? runAgent;
        const preReconcileMtime = yield* mtimeMs(fileSystem, reviewFile);
        const reconcileOutcome = yield* Effect.result(
          run(
            {
              model: config.reconciliator.model,
              systemPrompt: RECONCILIATOR_SYSTEM,
              task:
                `Reconcile the canonical review at ${reviewFile}. ` +
                `Conflicts:\n${conflictNotes || '(mode=always — polish the merge)'}\n` +
                'Overwrite the canonical file in place with one coherent report.',
              tools: TOOLS.reconciliator,
              cwd: ctx.cwd,
            },
            RECONCILIATOR_TIMEOUT,
          ),
        );
        const postReconcileMtime = yield* mtimeMs(fileSystem, reviewFile);
        if (
          Result.isFailure(reconcileOutcome) &&
          !fileAdvanced(postReconcileMtime, preReconcileMtime)
        ) {
          yield* notify(
            ui,
            `Reconciliator error: ${reconcileOutcome.failure.message} — keeping programmatic merge.`,
            'warning',
          );
        }
        canonicalMarkdown = yield* fileSystem
          .readFileString(reviewFile, 'utf8')
          .pipe(Effect.orElseSucceed(() => canonicalMarkdown));
        reconcile = 'done';
        reconcileDetail = `${reconcileDetail}; llm`;
      } else {
        reconcile = 'done';
        reconcileDetail = `${reconcileDetail}; programmatic only`;
      }
      runningCtx = withWidget(runningCtx, { reconcile, reconcileDetail, phase: 'merge' });
    }

    // ── Deadlock detection (programmatic) ──
    const priorState =
      runningCtx.loopState ??
      (yield* loadLoopState(
        reviewFile,
        config.reviewers.map((profile) => profile.id),
      ));
    const deadlockResult = applyDeadlockDetection({
      state: priorState,
      markdown: canonicalMarkdown,
      cycle,
      flipThreshold: config.deadlock.flipThreshold,
    });
    canonicalMarkdown = deadlockResult.markdown;

    // NOT best-effort: the transition below is computed by re-parsing this
    // file, so a swallowed write failure would act on stale pre-merge counts.
    // A failure here fails the node (runGraph marks the loop 'failed').
    yield* fileSystem.writeFileString(reviewFile, canonicalMarkdown);
    yield* saveLoopState(reviewFile, deadlockResult.state);

    if (deadlockResult.newlyDeadlocked.length > 0) {
      yield* notify(
        ui,
        `[adversarial-review-loop] Deadlock escalated: ${deadlockResult.newlyDeadlocked.join(', ')}`,
        'warning',
      );
    }

    const summary = yield* parseSummary(reviewFile);
    let nextCtx: GraphCtx = {
      ...runningCtx,
      summary,
      reviewerConsecutiveFailures: 0,
      loopState: deadlockResult.state,
    };
    nextCtx = withWidget(nextCtx, {
      reconcile,
      reconcileDetail,
      summary,
      deadlocks: deadlockResult.state.deadlocks.length,
      phase: 'reviewed',
      fixer: 'waiting' as FixerWidgetStatus,
    });

    const transition = transitionAfterReview({
      summary,
      featureSpec: nextCtx.featureSpecCtx != null,
    });

    if (transition === 'done') {
      yield* Console.log(
        `[adversarial-review-loop] Reviewer: all findings terminal ` +
          `(Resolved=${Option.getOrElse(summary, () => undefined)?.resolved}, ` +
          `Won't Fix=${Option.getOrElse(summary, () => undefined)?.wontFix}). Closing loop.`,
      );
      yield* setStatus(ui, '● adversarial-review-loop DONE');
      yield* notify(
        ui,
        '[adversarial-review-loop] Completed: all findings resolved or dismissed.',
        'info',
      );
      clearLoopWidget(ui);
      return { next: null, ctx: { ...nextCtx, terminal: 'done' as const } };
    }

    if (transition === 'escalated') {
      yield* Console.log(
        '[adversarial-review-loop] Only Escalated findings remain — surfacing to human.',
      );
      yield* notify(
        ui,
        `[adversarial-review-loop] ${Option.getOrElse(summary, () => undefined)?.escalated} escalated finding(s) need human input. Review file: ${reviewFile}`,
        'warning',
      );
      yield* setStatus(ui, '● adversarial-review-loop ESCALATED');
      clearLoopWidget(ui);
      return { next: null, ctx: { ...nextCtx, terminal: 'escalated' as const } };
    }

    return { next: transition, ctx: nextCtx };
  });

/**
 * Feature-spec remediation branch.
 */
const featureRemediate: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const { opts, ui, reviewFile, featureSpecCtx, cycle = 0 } = ctx;
    if (featureSpecCtx?.phase.reviewTask == null || reviewFile === undefined) {
      return { next: 'fixer', ctx };
    }

    const config = configOf(opts);
    const reviewTask = featureSpecCtx.phase.reviewTask;
    const path = yield* Path;

    const reviewLoopIteration = yield* getReviewLoopCounter(reviewTask.memoryPath);
    if (reviewLoopIteration >= MAX_REVIEW_LOOP_ITERATIONS) {
      yield* notify(
        ui,
        `[adversarial-review-loop] Review loop cap reached: on-disk MEMORY.md iteration=${reviewLoopIteration} ` +
          `(>= ${MAX_REVIEW_LOOP_ITERATIONS}), in-memory cycle=${cycle}, --max-loops=${config.maxLoops}. ` +
          `Halting feature-spec mode with unresolved findings.`,
        'error',
      );
      yield* setStatus(ui, '● adversarial-review-loop REVIEW CAP REACHED');
      clearLoopWidget(ui);
      return { next: null, ctx: { ...ctx, terminal: 'reviewCap' as const } };
    }

    const allFindings = yield* extractFindings(reviewFile);
    const acceptedFindings = allFindings.filter((finding) => finding.status === 'Open');

    if (acceptedFindings.length === 0) {
      const summary = yield* parseSummary(reviewFile);
      const transition = transitionAfterReview({ summary, featureSpec: true });
      if (transition === 'done' || transition === 'escalated') {
        yield* updateReviewLoopCounter(reviewTask.memoryPath, reviewLoopIteration + 1, 0, 0);
        yield* Console.log(
          `[adversarial-review-loop] Feature-spec: iteration ${reviewLoopIteration + 1} found no actionable findings. Terminal: ${transition}.`,
        );
        yield* setStatus(
          ui,
          transition === 'done'
            ? '● adversarial-review-loop DONE'
            : '● adversarial-review-loop ESCALATED',
        );
        clearLoopWidget(ui);
        return { next: null, ctx: { ...ctx, summary, terminal: transition } };
      }
      const inReviewOnly =
        Option.isSome(summary) &&
        summary.value.open === 0 &&
        summary.value.inReview > 0;
      if (inReviewOnly) {
        yield* Console.log(
          `[adversarial-review-loop] Feature-spec: ${summary.value.inReview} finding(s) In Review — returning to reviewer for verification.`,
        );
        if (cycle >= config.maxLoops) {
          yield* setStatus(ui, undefined);
          yield* notify(
            ui,
            `[adversarial-review-loop] Max loops (${config.maxLoops}) reached. Review file: ${reviewFile}`,
            'warning',
          );
          clearLoopWidget(ui);
          return { next: null, ctx: { ...ctx, summary, terminal: 'maxLoops' as const } };
        }
        return { next: 'review', ctx: { ...ctx, summary, reviewerConsecutiveFailures: 0 } };
      }
      yield* updateReviewLoopCounter(reviewTask.memoryPath, reviewLoopIteration + 1, 0, 0);
      yield* notify(
        ui,
        `[adversarial-review-loop] Feature-spec: Summary still claims non-terminal work but no Open findings were extractable. Closing to avoid an infinite loop. Review file: ${reviewFile}`,
        'warning',
      );
      yield* setStatus(ui, '● adversarial-review-loop DONE');
      clearLoopWidget(ui);
      return { next: null, ctx: { ...ctx, summary, terminal: 'done' as const } };
    }

    const refreshedPhase = yield* findActivePhase(
      featureSpecCtx.spec,
      featureSpecCtx.spec.lockedPhases,
    );
    const phaseLetter = refreshedPhase?.phase ?? featureSpecCtx.phase.phase;
    const highestTaskId =
      refreshedPhase?.highestTaskId ?? featureSpecCtx.phase.highestTaskId;

    const fileSystem = yield* FileSystem;
    const phaseDir = path.join(featureSpecCtx.spec.featureDir, phaseLetter);
    const phaseEntries = yield* fileSystem
      .readDirectory(phaseDir)
      .pipe(Effect.orElseSucceed((): readonly string[] => []));
    const pendingFindings: typeof acceptedFindings = [];
    for (const finding of acceptedFindings) {
      const suffix = `remediate-${finding.id.toLowerCase()}`;
      const alreadyExists = phaseEntries.some(
        (entry) => entry === suffix || entry.endsWith(`-${suffix}`),
      );
      if (!alreadyExists) pendingFindings.push(finding);
    }

    if (pendingFindings.length === 0) {
      yield* Console.log(
        `[adversarial-review-loop] Feature-spec: remediation dirs already exist for ${acceptedFindings.length} finding(s); re-running fixer without creating new tasks.`,
      );
      yield* setStatus(
        ui,
        statusLine(cycle, config.maxLoops, 'fixer-remediation', `re-fixing ${acceptedFindings.length} tasks`),
      );
      const existingRun = yield* runFeatureRemediationFixer(ctx, deps, reviewFile);
      if (existingRun.terminal !== undefined) {
        clearLoopWidget(ui);
        return { next: null, ctx: existingRun.ctx };
      }
      yield* updateReviewLoopCounter(reviewTask.memoryPath, reviewLoopIteration + 1, 0, 0);
      return {
        next: 'review',
        ctx: {
          ...existingRun.ctx,
          featureSpecCtx: refreshedPhase
            ? { spec: featureSpecCtx.spec, phase: { ...refreshedPhase, phase: phaseLetter } }
            : { ...featureSpecCtx, phase: { ...featureSpecCtx.phase, phase: phaseLetter } },
          reviewerConsecutiveFailures: 0,
        },
      };
    }

    const { taskIds } = yield* createRemediationTasks(
      pendingFindings,
      phaseLetter,
      highestTaskId,
      reviewTask.id,
      featureSpecCtx.spec.featureDir,
      reviewFile,
    );

    const featureMdPath = path.join(featureSpecCtx.spec.featureDir, 'FEATURE.md');
    const newTasks = taskIds.flatMap((id, index) => {
      const finding = pendingFindings[index];
      return finding === undefined ? [] : [{ id, name: `remediate-${finding.id.toLowerCase()}` }];
    });
    yield* updateFeatureTaskTable(featureMdPath, newTasks);

    yield* updateReviewLoopCounter(
      reviewTask.memoryPath,
      reviewLoopIteration + 1,
      pendingFindings.length,
      taskIds.length,
    );

    yield* Console.log(
      `[adversarial-review-loop] Feature-spec: created ${taskIds.length} remediation task(s) for ${pendingFindings.length} finding(s). Task IDs: ${taskIds.join(', ')}`,
    );

    yield* setStatus(
      ui,
      statusLine(cycle, config.maxLoops, 'fixer-remediation', `remediating ${taskIds.length} tasks`),
    );
    yield* Console.log(
      `[adversarial-review-loop] Cycle ${cycle}/${config.maxLoops} — Fixer remediating ${taskIds.length} finding(s)`,
    );

    const createdRun = yield* runFeatureRemediationFixer(ctx, deps, reviewFile);
    if (createdRun.terminal !== undefined) {
      clearLoopWidget(ui);
      return { next: null, ctx: createdRun.ctx };
    }

    const lastTaskId = taskIds[taskIds.length - 1] ?? highestTaskId;
    const updatedPhase = {
      ...(refreshedPhase ?? featureSpecCtx.phase),
      phase: phaseLetter,
      highestTaskId: lastTaskId,
    };

    return {
      next: 'review',
      ctx: {
        ...createdRun.ctx,
        featureSpecCtx: { spec: featureSpecCtx.spec, phase: updatedPhase },
      },
    };
  });

/**
 * Runs the feature-spec fixer once and applies consecutive-failure / maxLoops
 * guards.
 * @param {GraphCtx} ctx The current graph context
 * @param {GraphDeps} deps Injectable dependencies
 * @param {string} reviewFile Absolute path to the review file
 * @returns Updated ctx plus an optional terminal reason
 */
const runFeatureRemediationFixer = (
  ctx: GraphCtx,
  deps: GraphDeps,
  reviewFile: string,
): Effect.Effect<
  { readonly ctx: GraphCtx; readonly terminal: Terminal | undefined },
  never
> =>
  Effect.gen(function* () {
    const { opts, ui, cycle = 0 } = ctx;
    const config = configOf(opts);
    const remediate = deps.executeRemediations ?? executeRemediations;
    const remediation = yield* Effect.result(
      remediate(opts.targetDir, reviewFile, ctx.cwd, config.fixerModel),
    );
    const remediationResult = Result.isFailure(remediation)
      ? { success: 0, failed: 1 }
      : remediation.success;

    let fixerConsecutiveFailures = ctx.fixerConsecutiveFailures ?? 0;
    if (remediationResult.failed > 0) {
      fixerConsecutiveFailures++;
      if (fixerConsecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        yield* notify(
          ui,
          `Fixer failed ${fixerConsecutiveFailures} consecutive times during remediation. Escalating to human.`,
          'error',
        );
        yield* setStatus(ui, '● adversarial-review-loop FAILED');
        return {
          ctx: { ...ctx, fixerConsecutiveFailures, terminal: 'failed' as const },
          terminal: 'failed' as const,
        };
      }
    } else {
      fixerConsecutiveFailures = 0;
    }

    if (cycle >= config.maxLoops) {
      yield* setStatus(ui, undefined);
      yield* notify(
        ui,
        `[adversarial-review-loop] Max loops (${config.maxLoops}) reached. Review file: ${reviewFile}`,
        'warning',
      );
      return {
        ctx: { ...ctx, fixerConsecutiveFailures, terminal: 'maxLoops' as const },
        terminal: 'maxLoops' as const,
      };
    }

    return {
      ctx: { ...ctx, fixerConsecutiveFailures },
      terminal: undefined,
    };
  });

/**
 * Builds the fixer task prompt.
 * @param {GraphCtx} ctx The current graph context
 * @returns The fixer task prompt
 */
const buildFixerTask = (ctx: GraphCtx): string => {
  const { opts, reviewFile } = ctx;
  return (
    `Resolve the findings in the review file at ${reviewFile}. ` +
    `Load and follow the addressing-adversarial-review skill at ${FIXER_SKILL_PATH} ` +
    'as your governing pipeline: triage findings by Status, enforce the per-finding ' +
    'Attempts ceiling (Max Attempts from Review Metadata, default 3), apply minimal ' +
    'fixes in severity order to the code under ' +
    `${opts.targetDir}, verify with the repo real checks (typecheck/lint/tests), ` +
    'increment Attempts per attempt, set Status to In Review after local verification ' +
    'passes (or leave Open on failure), append [Fixer] turns to each finding\'s ' +
    '### Discussion thread, and overwrite the review file in place. ' +
    'Do NOT touch Iteration or any reviewer-authored field. Escalate findings at the ceiling. ' +
    'Do not decide whether another review cycle should run.'
  );
};

/**
 * Standalone fixer turn node (fresh agent every cycle).
 */
const fixer: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const { opts, ui, reviewFile, cycle = 0 } = ctx;
    if (reviewFile === undefined) {
      yield* notify(ui, 'Internal error: reviewFile not resolved', 'error');
      return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
    }

    const config = configOf(opts);
    const fileSystem = yield* FileSystem;

    let runningCtx = withWidget(ctx, { fixer: 'running', phase: 'fixer' });
    yield* setStatus(ui, statusLine(cycle, config.maxLoops, 'fixer', 'running'));
    yield* Console.log(`[adversarial-review-loop] Cycle ${cycle}/${config.maxLoops} — Fixer`);

    const fixerTask = buildFixerTask(runningCtx);
    const preFixMtime = yield* mtimeMs(fileSystem, reviewFile);
    const run = deps.runAgent ?? runAgent;

    const fixOutcome = yield* Effect.result(
      run(
        {
          model: config.fixerModel,
          systemPrompt: FIXER_SYSTEM,
          task: fixerTask,
          tools: TOOLS.fixer,
          cwd: ctx.cwd,
        },
        FIXER_TIMEOUT,
      ),
    );
    const fixResult = Result.isFailure(fixOutcome)
      ? { text: '', error: fixOutcome.failure.message }
      : fixOutcome.success;

    let fixerConsecutiveFailures = ctx.fixerConsecutiveFailures ?? 0;

    if (fixResult.error !== undefined) {
      const postFixMtime = yield* mtimeMs(fileSystem, reviewFile);
      if (fileAdvanced(postFixMtime, preFixMtime)) {
        yield* Console.log(
          '[adversarial-review-loop] Fixer reported error but review file was updated — assuming success.',
        );
        fixerConsecutiveFailures = 0;
      } else {
        yield* notify(ui, `Fixer error: ${fixResult.error}`, 'error');
        fixerConsecutiveFailures++;
        if (fixerConsecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          yield* notify(
            ui,
            `Fixer failed ${fixerConsecutiveFailures} consecutive times. Escalating to human.`,
            'error',
          );
          yield* setStatus(ui, '● adversarial-review-loop FAILED');
          clearLoopWidget(ui);
          return {
            next: null,
            ctx: { ...runningCtx, fixerConsecutiveFailures, terminal: 'failed' as const },
          };
        }
        return { next: 'review', ctx: { ...runningCtx, fixerConsecutiveFailures } };
      }
    }

    fixerConsecutiveFailures = 0;

    const postFix = yield* parseSummary(reviewFile);
    if (isAllTerminal(postFix)) {
      yield* Console.log(
        '[adversarial-review-loop] Fixer advanced all findings to terminal status.',
      );
    }

    runningCtx = withWidget(
      { ...runningCtx, summary: postFix },
      { fixer: 'done', summary: postFix, phase: 'fixed' },
    );

    const next = transitionAfterFixer({ cycle, maxLoops: config.maxLoops });
    if (next === 'maxLoops') {
      yield* setStatus(ui, undefined);
      yield* notify(
        ui,
        `[adversarial-review-loop] Max loops (${config.maxLoops}) reached. Review file: ${reviewFile}`,
        'warning',
      );
      clearLoopWidget(ui);
      return {
        next: null,
        ctx: { ...runningCtx, fixerConsecutiveFailures, terminal: 'maxLoops' as const },
      };
    }

    return { next: 'review', ctx: { ...runningCtx, fixerConsecutiveFailures } };
  });

const NODES: Record<string, GraphNode> = {
  skillGate,
  resolveCtx,
  review,
  featureRemediate,
  fixer,
};

/**
 * Runs the adversarial-review-loop state machine until a terminal node.
 * Node errors that escape fine-grained handling are caught here: the user is
 * notified and the loop terminates as failed. Reviewers are fresh each cycle.
 * Supervisor (when used) is one persistent session for the whole loop and is
 * disposed when the graph exits.
 * @param {GraphCtx} initialCtx The initial graph context
 * @param {GraphDeps} [deps] Injectable dependencies (testing)
 * @returns The final graph context
 */
export const runGraph = (
  initialCtx: GraphCtx,
  deps: GraphDeps = {},
): Effect.Effect<GraphCtx, never, FileSystem | Path> =>
  Effect.suspend(() => {
    let ctx = initialCtx;
    // Ensure config is always present for callers that omit it.
    if (ctx.opts.config === undefined) {
      const fallback = defaultLoopConfig();
      const generic = fallback.reviewers[0] ?? {
        id: 'generic',
        label: 'Generic',
        model: ctx.opts.reviewerModel,
        skillPath: '',
        objective: 'full adversarial audit',
        focus: 'full adversarial audit',
      };
      ctx = {
        ...ctx,
        opts: {
          ...ctx.opts,
          config: {
            ...fallback,
            fixerModel: ctx.opts.fixerModel,
            maxLoops: ctx.opts.maxLoops,
            reviewers: [{ ...generic, model: ctx.opts.reviewerModel }],
          },
        },
      };
    }

    if (ctx.supervisorHolder === undefined) {
      ctx = { ...ctx, supervisorHolder: {} };
    }

    let next: string | null = 'skillGate';

    const loop = Effect.gen(function* () {
      while (next !== null) {
        const nodeName = next;
        const node = NODES[nodeName];
        if (node === undefined) {
          yield* notify(ctx.ui, `Unknown graph node: ${nodeName}`, 'error');
          clearLoopWidget(ctx.ui);
          return { ...ctx, terminal: 'failed' as const };
        }

        const result = yield* node(ctx, deps).pipe(
          Effect.matchEffect({
            onSuccess: (nodeResult) => Effect.succeed(nodeResult),
            onFailure: (error) =>
              Effect.gen(function* () {
                yield* notify(
                  ctx.ui,
                  `[adversarial-review-loop] Unexpected error in '${nodeName}': ${error.message}`,
                  'error',
                );
                yield* setStatus(ctx.ui, '● adversarial-review-loop FAILED');
                clearLoopWidget(ctx.ui);
                return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
              }),
          }),
        );

        ctx = result.ctx;
        next = result.next;
      }
      return ctx;
    });

    return loop.pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          clearLoopWidget(ctx.ui);
          const supervisor = ctx.supervisorHolder?.current ?? ctx.supervisor;
          if (supervisor !== undefined) {
            yield* supervisor.dispose();
          }
        }),
      ),
    );
  });
