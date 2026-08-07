import { dirname } from 'node:path';
import { Effect, Option, Result } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import {
  buildReviewerSystem,
  FIXER_SYSTEM,
  SUPERVISOR_SYSTEM,
  TOOLS,
} from './agents';
import {
  createPersistentAgent,
  retryPrompt,
  runAgent,
  runAgentResilient,
  type AgentRunError,
  type AgentRunResult,
  type PersistentAgent,
  type RetryPolicy,
  type ToolActivity,
} from './runner';
import { parseSummary, isAllTerminal, type SummaryCounts } from './parse-summary';
import {
  isWithinReviews,
  resolveReviewFile,
  ReviewPathError,
} from './resolve-review-file';
import { verifyLoopSkills, type SkillVerificationError } from './verify-skill';
import { FIXER_SKILL_PATH } from './skill-paths';
import type { LoopConfig, ReviewerProfile } from './config';
import { defaultLoopConfig, DEFAULT_AGENT_CONCURRENCY } from './config';
import {
  briefPath,
  ensurePassDirs,
  ensureStateDirs,
  fixerErrorPath,
  fixerScratchPath,
  loadLoopState,
  passScratchPath,
  saveLoopState,
  type LoopState,
} from './loop-state';
import { applyDeadlockDetection } from './deadlock';
import {
  buildFixerSchedule,
  countStatuses,
  mergeFindingBlock,
  parseFindingBlocks,
  updateSummarySection,
  type FindingBlock,
} from './findings';
import {
  clearLoopWidget,
  phaseLabel,
  setLoopWidget,
  type FixerWidgetRow,
  type FixerWidgetStatus,
  type LoopWidgetState,
  type ReviewerWidgetRow,
  type WidgetUi,
} from './widget';
import { FixerActivityStore, StreamStore } from './stream';
import { HERDR_HEARTBEAT_MS, herdrEnabled, reportHerdrState } from './herdr';

export const MAX_CONSECUTIVE_FAILURES = 2;

/**
 * Max reviewer turn attempts per pass: the initial turn plus re-attempts
 * (each on a fresh session with the next fallback model). A reviewer that
 * still has not completed after this budget fails the pass (retry/escalate).
 */
export const MAX_REVIEWER_ATTEMPTS = 3;

/**
 * Max fixer dispatch attempts per finding per phase: the initial dispatch
 * plus re-dispatches (each gets the prior failure record + partial scratch as
 * hand-off context). A finding that still produced no valid scratch block
 * after this budget escalates to a human — the phase never resumes with a
 * failed finding.
 */
export const MAX_FIXER_DISPATCH_ATTEMPTS = 3;

export const REVIEWER_TIMEOUT = 900000;

/**
 * Per-finding fixer turn budget: the fixer must apply a code change AND run
 * the repo's real checks (typecheck/lint/tests) in one turn. Matches the
 * reviewer budget — a 5-minute cap was the most common cause of fixer
 * timeouts that surfaced as "produced no scratch block".
 */
export const FIXER_TIMEOUT = 900000;

export const SUPERVISOR_TIMEOUT = 600000;

export interface LoopOptions {
  readonly reviewerModel: string;
  readonly fixerModel: string;
  readonly maxLoops: number;
  /** Cycles per loop (0-based cap; when config is present, config.maxCycles wins). */
  readonly maxCycles?: number;
  readonly targetDir: string;
  readonly reviewName: string;
  readonly fresh: boolean;
  readonly config: LoopConfig;
  /** Human-readable scope description injected into reviewer tasks (interactive mode). */
  readonly reviewScope?: string;
  /** Files/directories in scope (when known from interactive setup). */
  readonly scopeFiles?: readonly string[];
  /** Absolute path to a materialized diff file (git-unstaged scope). */
  readonly scopeDiffPath?: string;
  /**
   * Absolute path to an existing review to resume (overrides resolveReviewFile;
   * implies `fresh: false` semantics — re-review in place).
   */
  readonly reviewFile?: string;
  /**
   * Free-form user directive for the supervisor (e.g. "audit only the
   * file-signing flow in src/crypto/" or "check the import feature"). The
   * supervisor treats it as the authoritative intent for the pass — it locates
   * the relevant code itself and scopes the specialists to it.
   */
  readonly directive?: string;
}

export interface Ui extends WidgetUi {
  readonly setStatus: (id: string, text: string | undefined) => void;
  readonly notify: (message: string, level: 'info' | 'warning' | 'error') => void;
}

export type Terminal = 'done' | 'failed' | 'escalated' | 'maxLoops' | 'stopped';

export interface GraphCtx {
  readonly opts: LoopOptions;
  readonly cwd: string;
  readonly ui: Ui;
  /** Abort signal for graceful stop requests (checked between steps). */
  readonly signal?: AbortSignal;
  readonly reviewFile?: string;
  readonly reReview?: boolean;
  /** 0-based index of the current loop (independent reviewer set). */
  readonly loop?: number;
  /** 0-based index of the current cycle within the current loop. */
  readonly cycle?: number;
  readonly reviewerConsecutiveFailures?: number;
  readonly summary?: Option.Option<SummaryCounts>;
  readonly terminal?: Terminal;
  readonly loopState?: LoopState;
  readonly widget?: LoopWidgetState;
  /**
   * Live per-agent stream store, shared with the loop widget (same mutable
   * reference across context clones — never replaced/spread).
   */
  readonly streams?: StreamStore;
  /**
   * Live per-fixer tool store, shared with the loop widget (same mutable
   * reference pattern as `streams`).
   */
  readonly fixerActivity?: FixerActivityStore;
  /** Persistent supervisor session for the whole loop (brief + aggregate). */
  readonly supervisor?: PersistentAgent;
  /**
   * Mutable holder updated eagerly at supervisor creation, so the session
   * stays reachable for disposal even when a defect escapes a node before the
   * new ctx (with `supervisor` set) is returned.
   */
  readonly supervisorHolder?: { current?: PersistentAgent };
  /**
   * Persistent reviewer sessions for the CURRENT loop — the same reviewers
   * re-review the updated code across cycles within a loop (with their
   * context). Replaced by a fresh set when the loop advances.
   */
  readonly reviewerSessions?: Readonly<Record<string, PersistentAgent>>;
  /** The loop index the reviewer sessions belong to (stale ⇒ recreate). */
  readonly reviewerSessionLoop?: number;
  /**
   * Per-reviewer mutable holders updated eagerly at session creation, so
   * sessions stay reachable for disposal even when a defect escapes a node
   * before the new ctx is returned.
   */
  readonly reviewerHolders?: Record<string, { current?: PersistentAgent }>;
  /**
   * Per-reviewer fallback step: how many models have been exhausted for each
   * reviewer (0 = primary model). Advanced whenever a reviewer session is
   * dropped after a failure, so the recreated session uses the next fallback
   * model. Reset on loop advance (fresh independent reviewer set).
   */
  readonly reviewerModelStep?: Readonly<Record<string, number>>;
  /**
   * Supervisor fallback step: how many models have been exhausted (0 =
   * primary). Advanced whenever the supervisor session is dropped after a
   * failure. Reset on loop advance.
   */
  readonly supervisorModelStep?: number;
}

export interface NodeResult {
  readonly next: string | null;
  readonly ctx: GraphCtx;
}

/** Errors that can escape a graph node into runGraph's top-level handler. */
type NodeError = SkillVerificationError | AgentRunError | PlatformError | ReviewPathError;

export interface GraphDeps {
  readonly verifySkill?: () => Effect.Effect<void, SkillVerificationError, FileSystem>;
  readonly runAgent?: typeof runAgent;
  readonly createPersistentAgent?: typeof createPersistentAgent;
  /**
   * Transient-retry policy applied to every agent turn (reviewers, supervisor,
   * fixers). Defaults to {@link DEFAULT_RETRY_POLICY}. Tests may inject
   * `NO_RETRY` to avoid backoff sleeps.
   */
  readonly retryPolicy?: RetryPolicy;
  /**
   * Asks the user a question mid-run (cycle-max decision point). Returns the
   * chosen option, or null on cancel. Absent (headless/tests) ⇒ the loop
   * terminates `maxLoops` instead of prompting.
   */
  readonly askUser?: (question: string, options: readonly string[]) => Promise<string | null>;
}

type GraphNode = (
  ctx: GraphCtx,
  deps: GraphDeps,
) => Effect.Effect<NodeResult, NodeError, FileSystem | Path>;

/**
 * Mutable handle for the currently running loop, shared with the focus
 * command (`/adversarial-review-loop-focus`). Carries the stream store, the
 * loop's UI (for re-pushing the widget), the focused agent key, and the latest
 * widget state.
 */
export interface ActiveLoopInfo {
  readonly streams: StreamStore;
  readonly ui: Ui;
  /** Agent key the widget is focused on (undefined = roster view). */
  focused: string | undefined;
  /** The most recently pushed widget state. */
  widget: LoopWidgetState | undefined;
  /** Canonical review file path (set once the graph resolves it). */
  reviewFile: string | undefined;
}

let activeLoop: ActiveLoopInfo | undefined;

/** The currently running loop's handle, or undefined when none is running. */
export const getActiveLoop = (): ActiveLoopInfo | undefined => activeLoop;

/**
 * Agents that have produced stream output, newest first (for the focus
 * command's picker).
 * @returns Agent keys + labels
 */
export const activeStreamAgents = (): readonly { readonly key: string; readonly label: string }[] =>
  activeLoop?.streams.active().map((stream) => ({ key: stream.key, label: stream.label })) ??
  [];

/**
 * Focuses the loop widget on one agent's live stream (or clears it with
 * undefined). Re-pushes the widget carrying the same stream store, so the 1s
 * render timer shows fresh deltas. No-op when no loop is running.
 * @param {string | undefined} key Agent key, or undefined for the roster view
 * @returns Nothing
 */
export const focusAgentStream = (key: string | undefined): void => {
  const handle = activeLoop;
  if (handle === undefined) return;
  handle.focused = key;
  if (handle.widget !== undefined) {
    setLoopWidget(handle.ui, { ...handle.widget, focused: key });
  }
};

const STATUS_KEY = 'adversarial-review-loop';

/**
 * True when the loop has been asked to stop (abort signal fired).
 * @param {GraphCtx} ctx The graph context
 * @returns True when a stop was requested
 */
const stopRequested = (ctx: GraphCtx): boolean => ctx.signal?.aborted ?? false;

/**
 * Graceful stop outcome: notify, clear the status, and terminate the loop.
 * @param {GraphCtx} ctx The graph context
 * @returns A node result terminating the graph
 */
const stopResult = (ctx: GraphCtx): Effect.Effect<NodeResult, never, FileSystem | Path> =>
  Effect.gen(function* () {
    yield* notify(ctx.ui, '[adversarial-review-loop] Stopped by user request.', 'warning');
    yield* setStatus(ctx.ui, undefined);
    return { next: null, ctx: { ...ctx, terminal: 'stopped' as const } };
  });

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
  Effect.sync(() =>
    ui.setStatus(
      STATUS_KEY,
      // Color the footer status when the theme is available (TUI runs).
      text === undefined || ui.theme === undefined ? text : ui.theme.fg('accent', text),
    ),
  );

/**
 * Builds a status line for the Pi UI.
 * @param {number} loop Current loop (0-based; displayed 1-based)
 * @param {number} maxLoops Total loops
 * @param {number} cycle Current cycle number (1-based, the cycle being run/fixed)
 * @param {number} maxCycles Max cycles per loop
 * @param {string} phase Current phase
 * @param {string} status Current status label
 * @returns The formatted status line
 */
export const statusLine = (
  loop: number,
  maxLoops: number,
  cycle: number,
  maxCycles: number,
  phase: string,
  status: string,
): string =>
  `● adversarial-review-loop [loop ${loop + 1}/${maxLoops} · cycle ${cycle}/${maxCycles}] ${phaseLabel(phase)}: ${status}`;

/**
 * Pure transition after a successful reviewer turn + summary parse.
 * @param {{ summary: Option.Option<SummaryCounts> }} input Review outcome
 * @returns The next transition name
 */
export const transitionAfterReview = (input: {
  readonly summary: Option.Option<SummaryCounts>;
}): 'consensus' | 'escalated' | 'fixer' => {
  const { summary } = input;
  if (isAllTerminal(summary)) return 'consensus';
  if (
    Option.isSome(summary) &&
    summary.value.open === 0 &&
    summary.value.inReview === 0 &&
    summary.value.escalated > 0
  ) {
    return 'escalated';
  }
  return 'fixer';
};

/**
 * Pure transition after a fixer turn: the same reviewers re-review the
 * updated code until the per-loop cycle cap; beyond it the orchestrator asks
 * the user (increase cycles / next loop / add a loop / stop).
 * @param {{ cycle: number, maxCycles: number }} input Loop counters
 * @returns The next transition name
 */
export const transitionAfterFixer = (input: {
  readonly cycle: number;
  readonly maxCycles: number;
}): 'review' | 'cycleMax' => (input.cycle < input.maxCycles ? 'review' : 'cycleMax');

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
  const loop = ctx.loop ?? 0;
  const cycle = ctx.cycle ?? 0;
  const base: LoopWidgetState = ctx.widget ?? {
    loop,
    maxLoops: config.maxLoops,
    cycle,
    maxCycles: config.maxCycles,
    supervisor: 'idle',
    reviewers: initialReviewerRows(config.reviewers),
    fixer: 'waiting',
    summary: ctx.summary ?? Option.none(),
    deadlocks: ctx.loopState?.deadlocks.length ?? 0,
    phase: 'starting',
  };
  const widget: LoopWidgetState = {
    ...base,
    loop: patch.loop ?? base.loop,
    maxLoops: patch.maxLoops ?? base.maxLoops,
    cycle: patch.cycle ?? base.cycle,
    maxCycles: patch.maxCycles ?? base.maxCycles,
    supervisor: patch.supervisor ?? base.supervisor,
    supervisorDetail: patch.supervisorDetail ?? base.supervisorDetail,
    reviewers: patch.reviewers ?? base.reviewers,
    fixer: patch.fixer ?? base.fixer,
    summary: patch.summary ?? base.summary,
    deadlocks: patch.deadlocks ?? base.deadlocks,
    phase: patch.phase ?? base.phase,
    loopStatus: patch.loopStatus ?? base.loopStatus,
    decision: patch.decision ?? base.decision,
    // The focus command owns the focused key; a graph re-push must not reset
    // it (the graph's ctx.widget snapshot can be stale relative to the handle).
    focused: patch.focused ?? activeLoop?.focused ?? base.focused,
    // The same mutable stream store flows through every widget push.
    streams: patch.streams ?? base.streams ?? ctx.streams,
    // Same for the per-fixer tool store.
    fixerActivity: patch.fixerActivity ?? base.fixerActivity ?? ctx.fixerActivity,
    fixers: patch.fixers ?? base.fixers,
    fixerSchedule: patch.fixerSchedule ?? base.fixerSchedule,
    fixerWave: patch.fixerWave ?? base.fixerWave,
    // Each phase transition clears the transient live-tool line and restarts
    // the elapsed timer.
    tool: patch.tool,
    phaseStartedAt: Date.now(),
  };
  setLoopWidget(ctx.ui, widget);
  if (activeLoop !== undefined) {
    activeLoop.widget = widget;
  }
  return { ...ctx, widget };
};

/**
 * Builds a tool-activity callback that live-updates the widget's "now" line
 * while an agent runs (tool starts only — the next phase transition clears it).
 * @param {GraphCtx} ctx The current graph context (reads the latest widget)
 * @param {string} label Agent label, e.g. `reviewer generic`
 * @returns The tool-activity callback
 */
const toolProgress = (ctx: GraphCtx, label: string): ((activity: ToolActivity) => void) =>
  (activity) => {
    if (activity.kind !== 'start' || ctx.widget === undefined) return;
    const widget = { ...ctx.widget, tool: `${label} — ${activity.tool}` };
    setLoopWidget(ctx.ui, widget);
    // Keep the focus command's handle fresh so a focus re-push shows the
    // current tool line (not a stale withWidget snapshot).
    if (activeLoop !== undefined) activeLoop.widget = widget;
  };

/**
 * Tool-activity callback for ONE fixer: records the tool in the per-fixer
 * activity store (so the fixer's row in the widget shows it) and updates the
 * global `now` line.
 * @param {GraphCtx} ctx The current graph context (carries the activity store)
 * @param {string} findingId The finding being fixed
 * @returns The tool-activity callback
 */
const fixerToolProgress = (
  ctx: GraphCtx,
  findingId: string,
): ((activity: ToolActivity) => void) =>
  (activity) => {
    if (activity.kind !== 'start' || ctx.widget === undefined) return;
    ctx.fixerActivity?.setTool(findingId, activity.tool);
    const widget = { ...ctx.widget, tool: `fixer ${findingId} — ${activity.tool}` };
    setLoopWidget(ctx.ui, widget);
    if (activeLoop !== undefined) activeLoop.widget = widget;
  };

/**
 * Builds a token-delta callback that appends an agent's live stream to the
 * shared stream store (read by the widget's focused view).
 * @param {GraphCtx} ctx The current graph context (carries the stream store)
 * @param {string} key Stream key, e.g. `supervisor`, `reviewer:generic`, `fixer:F1`
 * @param {string} label Human label for the focused view
 * @returns The delta callback
 */
const agentDelta = (ctx: GraphCtx, key: string, label: string) =>
  (delta: string, kind: 'text' | 'thinking'): void => {
    ctx.streams?.append(key, label, kind, delta);
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
 * Resolve the canonical review file path (and re-review flag).
 */
const resolveCtx: GraphNode = (ctx) =>
  Effect.gen(function* () {
    const { opts, cwd, ui } = ctx;
    const config = configOf(opts);
    const path = yield* Path;

    // Both input channels are validated so review markdown, loop-state.json,
    // and pass scratch files can never be written outside `.agents/reviews/`:
    // `reviewName` is checked by resolveReviewFile (isValidPresetName), and
    // `opts.reviewFile` is resolved and asserted to stay under the reviews root.
    const candidate =
      opts.reviewFile !== undefined
        ? opts.reviewFile
        : yield* resolveReviewFile(cwd, opts.reviewName, opts.fresh);
    if (!isWithinReviews(path, cwd, candidate)) {
      return yield* Effect.fail(
        new ReviewPathError({
          message: `Review file escapes .agents/reviews/: ${candidate}`,
        }),
      );
    }
    const resolvedReviewFile = path.resolve(candidate);
    // Expose the canonical review path on the active-loop handle so the
    // findings browser (/adversarial-review-loop-findings, ctrl+shift+i) can
    // read the findings while the loop runs.
    if (activeLoop !== undefined) {
      activeLoop.reviewFile = resolvedReviewFile;
    }

    yield* ensureStateDirs(resolvedReviewFile);

    const fileSystem = yield* FileSystem;
    const reviewFileExists = yield* fileSystem
      .exists(resolvedReviewFile)
      .pipe(Effect.orElseSucceed(() => false));
    const reReview = reviewFileExists && !opts.fresh;

    let loopState = yield* loadLoopState(
      resolvedReviewFile,
      config.reviewers.map((profile) => profile.id),
    );

    // Lock the config into loop-state: fresh runs and legacy states (no
    // snapshot) persist the resolved config so a later resume reuses exactly
    // what this review started with — never a newer/edited preset. The loaded
    // state is updated in place so later saves (review/fixer nodes) keep it.
    if (loopState.config === undefined) {
      const withConfig = { ...loopState, config };
      yield* saveLoopState(resolvedReviewFile, withConfig);
      loopState = withConfig;
    }

    // Programmatic early exit: resumed all-terminal file needs no agent calls
    // ONLY when no further loops remain. The on-disk Summary is agent-written
    // and can be miscounted (e.g. an `Open: 0` line while an Open finding block
    // is present), which would falsely terminate a resumed run. Recompute the
    // counts from the actual finding blocks instead of trusting the Summary. A
    // missing/unreadable file must not look all-terminal, so it keeps iterating
    // (mirrors parseSummary's defensive `None`).
    if (reReview) {
      const existingText = yield* fileSystem
        .readFileString(resolvedReviewFile, 'utf8')
        .pipe(Effect.orElseSucceed(() => null));
      const existingSummary =
        existingText === null
          ? Option.none<SummaryCounts>()
          : Option.some(countStatuses(parseFindingBlocks(existingText)));
      if (isAllTerminal(existingSummary)) {
        const loop = loopState.loop ?? 0;
        if (loop + 1 < config.maxLoops) {
          // Consensus was reached in the last cycle of an earlier loop — the
          // run stopped before advancing. Resume by spawning the next loop's
          // fresh reviewers instead of declaring victory early.
          const advancedState = { ...loopState, loop: loop + 1, cycle: 0 };
          yield* saveLoopState(resolvedReviewFile, advancedState);
          yield* notify(
            ui,
            `[adversarial-review-loop] Loop ${loop + 1} reached consensus — resuming at loop ${loop + 2} with fresh reviewers.`,
            'info',
          );
          loopState = advancedState;
        } else {
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
              loopState,
              summary: existingSummary,
              terminal: 'done' as const,
            },
          };
        }
      }
    }

    const rosterLabel = config.reviewers.map((profile) => profile.id).join(',');
    const scopeLabel =
      opts.reviewScope !== undefined && opts.reviewScope.trim() !== ''
        ? ` scope="${opts.reviewScope.trim().slice(0, 80)}"`
        : opts.directive !== undefined && opts.directive.trim() !== ''
          ? ` directive="${opts.directive.trim().slice(0, 80)}"`
          : '';
    yield* setStatus(ui, '● starting');
    yield* notify(
      ui,
      `[adversarial-review-loop] file=${resolvedReviewFile} reReview=${reReview} ` +
        `reviewers=${rosterLabel} fixer=${config.fixerModel} ` +
        `loops=${config.maxLoops} cycles/loop=${config.maxCycles} dir=${opts.targetDir} supervisor=always${scopeLabel}`,
      'info',
    );

    const loop = loopState.loop ?? 0;
    let nextCtx: GraphCtx = {
      ...ctx,
      reviewFile: resolvedReviewFile,
      reReview,
      // Resumed runs continue the loop/cycle counts from loop-state instead
      // of restarting (fresh runs have empty state → loop 0, cycle 0).
      loop,
      cycle: loopState.cycle,
      reviewerConsecutiveFailures: 0,
      loopState,
      reviewerHolders: Object.fromEntries(
        config.reviewers.map((profile) => [profile.id, {}]),
      ),
    };
    nextCtx = withWidget(nextCtx, {
      loop,
      maxLoops: config.maxLoops,
      cycle: loopState.cycle,
      maxCycles: config.maxCycles,
      supervisor: 'idle',
      reviewers: initialReviewerRows(config.reviewers),
      fixer: 'waiting',
      phase: 'starting',
      deadlocks: loopState.deadlocks.length,
      loopStatus: 'running',
    });

    // Resume routing: after the review phase completes (phase 'reviewed') a
    // resume jumps straight into the fixer phase — the reviewers already ran
    // and their verdicts are in the canonical — instead of re-running them.
    // Checkpoint recovery inside the fixer node then re-merges any valid
    // scratch left by an interrupted pass and re-dispatches only the rest.
    const resumeAtFixer = reReview && loopState.phase === 'reviewed';
    if (resumeAtFixer) {
      yield* notify(
        ui,
        `[adversarial-review-loop] Resuming at the fixer phase (loop ${loop + 1}, cycle ${loopState.cycle + 1}) — reviewers already ran; recovering fixer checkpoints and re-dispatching failed findings.`,
        'info',
      );
    }

    return { next: resumeAtFixer ? 'fixer' : 'review', ctx: nextCtx };
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
  if (opts.directive !== undefined && opts.directive.trim() !== '') {
    parts.push(`USER DIRECTIVE — ${opts.directive.trim()}`);
  }
  const reviewScope = opts.reviewScope?.trim() ?? '';
  // Directive mode sets reviewScope == directive; don't repeat it.
  if (reviewScope !== '' && reviewScope !== opts.directive?.trim()) {
    parts.push(`Scope — ${reviewScope}`);
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
  const { opts, reviewFile, reReview, loop = 0, cycle = 0 } = ctx;
  const skillPath = profile.skillPath;
  const objective = profile.objective;
  const briefClause =
    briefFile !== undefined
      ? `Read the supervisor brief at ${briefFile} and obey your assignment for id=${profile.id}. `
      : '';
  const scopeClause = buildScopeClause(opts);
  // Cycle 1 of a later loop is a FRESH independent reviewer set auditing the
  // accumulated canonical — they must verify earlier loops' resolutions too.
  const freshLoopSet = loop > 0 && cycle === 1;

  // Full fresh report only on the very first cycle of the first loop (or a
  // fresh resume that restarts it). Every later cycle — including cycle 1 of
  // later loops with their fresh reviewer set — re-reviews the canonical
  // file: verify prior resolutions against the code and hunt for regressions.
  if (cycle === 1 && loop === 0 && !reReview) {
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
    (freshLoopSet
      ? 'You are a fresh independent reviewer set. Spot-check Resolved and Won\'t Fix findings ' +
        'from earlier loops against the actual code too — reopen with a [Reviewer] turn when the ' +
        'resolution is wrong or incomplete. '
      : '') +
    `Your objective: ${objective}. ` +
    `Write your updated report to ${outputPath} — always your own scratch path, ` +
    'never the canonical review file. ' +
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
 * Runs one reviewer turn on a persistent per-loop session: the same reviewer
 * re-reviews the updated code across cycles within a loop (carrying its
 * context). Never a fresh session per cycle.
 * @param {GraphCtx} ctx Graph context
 * @param {ReviewerProfile} profile Reviewer profile
 * @param {string} outputPath Output path for this reviewer
 * @param {string | undefined} [briefFile] Optional supervisor brief path
 * @param {PersistentAgent} session The reviewer's persistent session
 * @returns Agent run result
 */
const runReviewer = (
  ctx: GraphCtx,
  profile: ReviewerProfile,
  outputPath: string,
  briefFile: string | undefined,
  session: PersistentAgent,
): Effect.Effect<AgentRunResult, never> =>
  session.prompt(
    buildReviewerTask(ctx, profile, outputPath, briefFile),
    REVIEWER_TIMEOUT,
    toolProgress(ctx, `reviewer ${profile.id}`),
    agentDelta(ctx, `reviewer:${profile.id}`, `reviewer ${profile.id}`),
  );

/**
 * Picks the model for a role at a given fallback step: 0 = primary, 1 = first
 * fallback, … clamped to the last configured model once the chain is
 * exhausted (later failures are then handled by the pass-level escalation,
 * not by re-cycling the chain).
 * @param {readonly string[]} models Ordered model chain (primary first)
 * @param {number} step How many models have been exhausted
 * @returns The model to use
 */
const modelAtStep = (models: readonly string[], step: number): string =>
  models[Math.min(step, Math.max(0, models.length - 1))] ?? models[0] ?? '';

/**
 * Ensures a persistent supervisor agent exists on the graph context. The
 * supervisor is created with the primary model (or the next fallback model
 * when earlier ones were exhausted — see {@link dropSupervisor}) and its
 * prompt is wrapped with the transient-retry policy.
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
    const policy = deps.retryPolicy;
    const models = [config.supervisor.model, ...(config.supervisor.fallbackModels ?? [])];
    const model = modelAtStep(models, ctx.supervisorModelStep ?? 0);
    const created = yield* create(
      {
        model,
        systemPrompt: SUPERVISOR_SYSTEM,
        tools: TOOLS.supervisor,
        cwd: ctx.cwd,
      },
      SUPERVISOR_TIMEOUT,
    );
    const supervisor: PersistentAgent = {
      ...created,
      // Transient failures (rate limits, overloads) retry on the same
      // session with backoff; timeouts return immediately (the caller drops
      // the poisoned session — see dropSupervisor).
      prompt: retryPrompt(created.prompt, SUPERVISOR_TIMEOUT, policy),
    };
    // Register eagerly: if a defect escapes before the new ctx is returned,
    // runGraph's ensuring can still dispose via the holder.
    const holder = ctx.supervisorHolder;
    if (holder !== undefined) holder.current = supervisor;
    return { ...ctx, supervisor };
  });

/**
 * Disposes the supervisor session and clears it from the context so the next
 * `ensureSupervisor` recreates a fresh session with the NEXT fallback model.
 * A failed/timed-out turn may still be running on the old session (the abort
 * signal is best-effort — providers can ignore it), so re-prompting it would
 * fail with pi's "Agent is already processing a prompt" busy error or
 * interleave two event streams. Dispose, advance the model step, and recreate
 * before retrying (F5).
 * @param {GraphCtx} ctx Context carrying the supervisor to drop
 * @returns Context without the supervisor, model step advanced
 */
const dropSupervisor = (ctx: GraphCtx): Effect.Effect<GraphCtx, never> =>
  Effect.gen(function* () {
    const supervisor = ctx.supervisor;
    if (supervisor !== undefined) yield* supervisor.dispose().pipe(Effect.ignore);
    if (ctx.supervisorHolder !== undefined) {
      ctx.supervisorHolder.current = undefined;
    }
    return {
      ...ctx,
      supervisor: undefined,
      supervisorModelStep: (ctx.supervisorModelStep ?? 0) + 1,
    };
  });

/**
 * Ensures persistent reviewer sessions exist for the CURRENT loop. Sessions
 * are created once per loop and reused across its cycles (the same reviewers
 * re-review the updated code with their context). When the loop index
 * changed (or no sessions exist), stale sessions are disposed and a fresh
 * independent set is created — that is the loop boundary.
 * @param {GraphCtx} ctx Graph context
 * @param {GraphDeps} deps Injectable deps
 * @param {LoopConfig} config Loop config
 * @returns Context with reviewer sessions attached
 */
const ensureReviewers = (
  ctx: GraphCtx,
  deps: GraphDeps,
  config: LoopConfig,
): Effect.Effect<GraphCtx, AgentRunError> =>
  Effect.gen(function* () {
    const loop = ctx.loop ?? 0;
    // Reuse the loop's session set only when EVERY reviewer still has a
    // session. A dropped reviewer (failure/timeout — see dropReviewerSession)
    // makes the retry pass recreate the full set with the next fallback model.
    const fullSet =
      ctx.reviewerSessions !== undefined &&
      ctx.reviewerSessionLoop === loop &&
      Object.keys(ctx.reviewerSessions).length === config.reviewers.length;
    if (fullSet) {
      return ctx;
    }
    // Stale sessions (previous loop, or a first creation that partially
    // failed) must be disposed before spawning the new set.
    const stale = Object.values(ctx.reviewerSessions ?? {});
    for (const session of stale) yield* session.dispose().pipe(Effect.ignore);
    for (const holder of Object.values(ctx.reviewerHolders ?? {})) {
      holder.current = undefined;
    }

    let nextCtx: GraphCtx = { ...ctx, reviewerSessions: {}, reviewerSessionLoop: loop };
    for (const profile of config.reviewers) {
      nextCtx = yield* ensureReviewerSession(nextCtx, deps, config, profile);
    }
    return nextCtx;
  });

/**
 * Ensures ONE reviewer session exists, creating it when missing. The model is
 * picked from the reviewer's fallback chain at the current step (advanced by
 * {@link dropReviewerSession} on failure), and the prompt is wrapped with the
 * transient-retry policy. Used both for the initial set (via
 * {@link ensureReviewers}) and for in-pass retries of a failed reviewer.
 * @param {GraphCtx} ctx Graph context
 * @param {GraphDeps} deps Injectable deps
 * @param {LoopConfig} config Loop config
 * @param {ReviewerProfile} profile The reviewer profile
 * @returns Context with that reviewer's session attached
 */
const ensureReviewerSession = (
  ctx: GraphCtx,
  deps: GraphDeps,
  config: LoopConfig,
  profile: ReviewerProfile,
): Effect.Effect<GraphCtx, AgentRunError> =>
  Effect.gen(function* () {
    if (ctx.reviewerSessions?.[profile.id] !== undefined) return ctx;
    const create = deps.createPersistentAgent ?? createPersistentAgent;
    const policy = deps.retryPolicy;
    // Fallback chain: primary model first, then the reviewer's configured
    // fallbacks (step advanced by dropReviewerSession on failure).
    const models = [profile.model, ...(profile.fallbackModels ?? [])];
    const model = modelAtStep(models, ctx.reviewerModelStep?.[profile.id] ?? 0);
    const created = yield* create(
      {
        model,
        systemPrompt: buildReviewerSystem(profile),
        tools: TOOLS.reviewer,
        cwd: ctx.cwd,
      },
      REVIEWER_TIMEOUT,
    );
    const session: PersistentAgent = {
      ...created,
      prompt: retryPrompt(created.prompt, REVIEWER_TIMEOUT, policy),
    };
    // Register eagerly: if a defect escapes before the new ctx is returned,
    // runGraph's ensuring can still dispose via the holders.
    const holder = ctx.reviewerHolders?.[profile.id];
    if (holder !== undefined) holder.current = session;
    return { ...ctx, reviewerSessions: { ...ctx.reviewerSessions, [profile.id]: session } };
  });

/**
 * Disposes one reviewer's session (a failed/timed-out turn poisons the
 * session — the generation may still be running, so re-prompting it would hit
 * pi's "already processing a prompt" busy error). Removes it from the session
 * map and advances the reviewer's fallback step so the retry pass recreates a
 * fresh session with the NEXT model via {@link ensureReviewers}.
 * @param {GraphCtx} ctx Context carrying the sessions
 * @param {string} reviewerId Reviewer profile id to drop
 * @returns Context without that reviewer's session, fallback step advanced
 */
const dropReviewerSession = (
  ctx: GraphCtx,
  reviewerId: string,
): Effect.Effect<GraphCtx, never> =>
  Effect.gen(function* () {
    const session = ctx.reviewerSessions?.[reviewerId];
    if (session !== undefined) yield* session.dispose().pipe(Effect.ignore);
    const holder = ctx.reviewerHolders?.[reviewerId];
    if (holder !== undefined) holder.current = undefined;
    const sessions = { ...ctx.reviewerSessions };
    delete sessions[reviewerId];
    return {
      ...ctx,
      reviewerSessions: sessions,
      reviewerModelStep: {
        ...ctx.reviewerModelStep,
        [reviewerId]: (ctx.reviewerModelStep?.[reviewerId] ?? 0) + 1,
      },
    };
  });

/**
 * Advances to the next loop: persists the new loop/cycle counters, disposes
 * the current loop's supervisor + reviewer sessions (the next loop spawns a
 * fresh independent set), and notifies. The review node then recreates
 * everything on its next pass.
 * @param {GraphCtx} ctx Graph context
 * @param {LoopConfig} config Loop config
 * @returns Context positioned at the next loop with sessions disposed
 */
const advanceLoop = (
  ctx: GraphCtx,
  config: LoopConfig,
): Effect.Effect<GraphCtx, PlatformError, FileSystem | Path> =>
  Effect.gen(function* () {
    const reviewFile = ctx.reviewFile;
    if (reviewFile !== undefined && ctx.loopState !== undefined) {
      const loop = (ctx.loop ?? 0) + 1;
      // Clear the phase marker: the next loop must run a fresh review before
      // any fixer work — a resume must not jump into the fixer for a loop
      // that has never been reviewed.
      const state = { ...ctx.loopState, loop, cycle: 0, phase: undefined };
      yield* saveLoopState(reviewFile, state);

      // Dispose the loop's sessions — fresh independent reviewers next.
      for (const session of Object.values(ctx.reviewerSessions ?? {})) {
        yield* session.dispose().pipe(Effect.ignore);
      }
      for (const holder of Object.values(ctx.reviewerHolders ?? {})) {
        holder.current = undefined;
      }
      if (ctx.supervisor !== undefined) {
        yield* ctx.supervisor.dispose().pipe(Effect.ignore);
        if (ctx.supervisorHolder !== undefined) ctx.supervisorHolder.current = undefined;
      }

      yield* notify(
        ctx.ui,
        `[adversarial-review-loop] Loop ${loop + 1}/${config.maxLoops} — spawning a fresh set of independent reviewers.`,
        'info',
      );

      const nextCtx: GraphCtx = {
        ...ctx,
        loop,
        cycle: 0,
        loopState: state,
        reviewerSessions: undefined,
        reviewerSessionLoop: undefined,
        supervisor: undefined,
        // Fresh loop = fresh independent reviewer set: start each model chain
        // back at the primary model (rate limits may have subsided by now).
        reviewerModelStep: undefined,
        supervisorModelStep: undefined,
      };
      return withWidget(nextCtx, {
        loop,
        maxLoops: config.maxLoops,
        cycle: 0,
        maxCycles: config.maxCycles,
        supervisor: 'idle',
        reviewers: initialReviewerRows(config.reviewers),
        fixer: 'waiting',
        phase: 'loop:advance',
        loopStatus: 'running',
        decision: undefined,
      });
    }
    return ctx;
  });

/**
 * Builds the supervisor brief-turn task.
 * @param {GraphCtx} ctx Graph context
 * @param {LoopConfig} config Loop config
 * @param {string} briefFile Brief output path
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @returns Task prompt
 */
const buildSupervisorBriefTask = (
  ctx: GraphCtx,
  config: LoopConfig,
  briefFile: string,
  loop: number,
  cycle: number,
): string => {
  const rosterBlock = config.reviewers
    .map(
      (profile) =>
        `- id=${profile.id} label=${profile.label} objective=${profile.objective} ` +
        `skill=${profile.skillPath} scratch=${passScratchPath(ctx.reviewFile!, loop, cycle, profile.id)}`,
    )
    .join('\n');
  const scopeClause = buildScopeClause(ctx.opts);
  const directive = ctx.opts.directive?.trim();
  const hasDirective = directive !== undefined && directive !== '';

  return (
    `BRIEF TURN (loop ${loop}, cycle ${cycle}).\n` +
    `Target directory: ${ctx.opts.targetDir}\n` +
    (hasDirective ? `USER DIRECTIVE — the authoritative intent for this pass: ${directive}\n` : '') +
    (scopeClause !== '' ? `Scope: ${scopeClause}\n` : '') +
    `Canonical review file: ${ctx.reviewFile}\n` +
    `Re-review: ${ctx.reReview || cycle > 1 || loop > 1 ? 'yes' : 'no'}\n` +
    `Write the pass brief to: ${briefFile}\n` +
    `Roster (user-selected — do not add/remove):\n${rosterBlock}\n` +
    'Follow the supervisor skill Turn A. Do not write the canonical review yet.' +
    (hasDirective
      ? '\nThe USER DIRECTIVE is what the user actually wants reviewed — treat it as authoritative. ' +
        'If it names specific code, locate it yourself with read/grep/glob before writing the brief ' +
        'and scope the specialists to it. Do not broaden beyond the directive.'
      : '')
  );
};

/**
 * Builds the supervisor aggregate-turn task.
 * @param {GraphCtx} ctx Graph context
 * @param {LoopConfig} config Loop config
 * @param {string} briefFile Brief path
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {readonly string[]} scratchFiles Scratch paths that exist
 * @returns Task prompt
 */
const buildSupervisorAggregateTask = (
  ctx: GraphCtx,
  config: LoopConfig,
  briefFile: string,
  loop: number,
  cycle: number,
  scratchFiles: readonly string[],
): string =>
  (
    `AGGREGATE TURN (loop ${loop}, cycle ${cycle}).\n` +
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
 * Review pass: supervisor brief → roster reviewers (scratch) → supervisor
 * aggregate → canonical review → deadlock check. Aggregation is always
 * agent-driven — the supervisor owns the canonical file.
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
    const loop = ctx.loop ?? 0;
    const cycle = (ctx.cycle ?? 0) + 1;
    let runningCtx: GraphCtx = { ...ctx, loop, cycle };

    runningCtx = withWidget(runningCtx, {
      loop,
      maxLoops: config.maxLoops,
      cycle: cycle - 1,
      maxCycles: config.maxCycles,
      supervisor: 'idle',
      reviewers: initialReviewerRows(config.reviewers),
      fixer: 'waiting',
      phase: 'supervisor:brief',
      deadlocks: runningCtx.loopState?.deadlocks.length ?? 0,
      loopStatus: 'running',
      decision: undefined,
    });

    yield* setStatus(
      ui,
      statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'supervisor', 'running'),
    );

    // Spawn the loop's persistent reviewer sessions (fresh set per loop; the
    // same reviewers re-review across this loop's cycles with their context).
    const reviewersEnsured = yield* Effect.result(ensureReviewers(runningCtx, deps, config));
    if (Result.isFailure(reviewersEnsured)) {
      yield* notify(
        ui,
        `Reviewer session create failed: ${reviewersEnsured.failure.message}`,
        'error',
      );
      clearLoopWidget(ui);
      return {
        next: null,
        ctx: { ...runningCtx, terminal: 'failed' as const },
      };
    }
    runningCtx = reviewersEnsured.success;

    yield* ensureStateDirs(reviewFile);
    yield* ensurePassDirs(reviewFile, loop + 1, cycle);
    const briefFile = briefPath(reviewFile, loop + 1, cycle);

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
    yield* setStatus(
      ui,
      statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'supervisor:brief', 'running'),
    );

    const briefSupervisor = runningCtx.supervisor;
    if (briefSupervisor === undefined) {
      yield* notify(ui, 'Supervisor session missing after create', 'error');
      clearLoopWidget(ui);
      return { next: null, ctx: { ...runningCtx, terminal: 'failed' as const } };
    }

    const preBrief = yield* mtimeMs(fileSystem, briefFile);
    const briefResult = yield* briefSupervisor.prompt(
      buildSupervisorBriefTask(runningCtx, config, briefFile, loop + 1, cycle),
      SUPERVISOR_TIMEOUT,
      toolProgress(runningCtx, 'supervisor brief'),
      agentDelta(runningCtx, 'supervisor', 'supervisor'),
    );
    const postBrief = yield* mtimeMs(fileSystem, briefFile);
    // The brief must exist and be non-empty before reviewers fan out — a
    // supervisor that finishes without error but never writes the brief (or
    // errors after a partial write) must not dispatch unbriefed reviewers.
    const briefContent = yield* fileSystem
      .readFileString(briefFile, 'utf8')
      .pipe(Effect.orElseSucceed(() => ''));
    const briefMissing = briefContent.trim() === '';
    // A timed-out turn marks the session as poisoned: the generation may
    // still be running (abort is best-effort), so retrying on the same
    // session would hit pi's "already processing a prompt" busy error.
    const briefTimedOut = briefResult.timedOut === true;
    if (
      briefTimedOut ||
      (briefResult.error !== undefined && !fileAdvanced(postBrief, preBrief)) ||
      briefMissing
    ) {
      yield* notify(
        ui,
        briefTimedOut
          ? `Supervisor brief timed out after ${SUPERVISOR_TIMEOUT}ms — retrying the review pass with a fresh session.`
          : briefMissing && briefResult.error === undefined
            ? 'Supervisor brief missing or empty after brief turn — refusing to fan out reviewers without scope.'
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
      // Never re-prompt a session whose generation may still be running:
      // dispose it, advance to the next fallback model, and let the retry
      // recreate a fresh supervisor.
      const retryCtx = yield* dropSupervisor(runningCtx);
      return {
        next: 'review',
        ctx: { ...retryCtx, reviewerConsecutiveFailures: failures },
      };
    }

    runningCtx = withWidget(runningCtx, {
      supervisor: 'waiting-specialists',
      phase: 'reviewers',
    });

    // ── Reviewer fan-out ──────────────────────────────────────────────
    // Reviewers are independent (codebase read-only; each writes only its own
    // scratch file), so they run in PARALLEL, capped by agentConcurrency.
    // They are PERSISTENT within the loop — the same session re-reviews the
    // updated code next cycle, carrying its context.
    const concurrency = config.agentConcurrency ?? DEFAULT_AGENT_CONCURRENCY;
    let reviewerRows: ReviewerWidgetRow[] = initialReviewerRows(config.reviewers).map((row) => ({
      ...row,
      status: 'running' as const,
    }));
    runningCtx = withWidget(runningCtx, {
      reviewers: reviewerRows,
      phase: 'reviewers',
      reviewerConcurrency: Math.min(config.reviewers.length, concurrency),
    });
    yield* setStatus(
      ui,
      statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'reviewers', 'running'),
    );

    const preMtimes: Option.Option<number>[] = [];
    for (const profile of config.reviewers) {
      preMtimes.push(
        yield* mtimeMs(fileSystem, passScratchPath(reviewFile, loop + 1, cycle, profile.id)),
      );
    }

    const reviewerOutcomes = yield* Effect.forEach(
      config.reviewers,
      (profile) => {
        const session = runningCtx.reviewerSessions?.[profile.id];
        if (session === undefined) {
          return Effect.succeed({ text: '', error: `no session for ${profile.id}` });
        }
        return runReviewer(
          runningCtx,
          profile,
          passScratchPath(reviewFile, loop + 1, cycle, profile.id),
          briefFile,
          session,
        );
      },
      { concurrency },
    );

    let failures = runningCtx.reviewerConsecutiveFailures ?? 0;
    const scratchFiles: string[] = [];
    const succeededIds = new Set<string>();
    reviewerRows = initialReviewerRows(config.reviewers);
    for (const [index, profile] of config.reviewers.entries()) {
      const outputPath = passScratchPath(reviewFile, loop + 1, cycle, profile.id);
      let result = reviewerOutcomes[index] ?? { text: '', error: 'no result' };
      let postMtime = yield* mtimeMs(fileSystem, outputPath);
      let wrote = fileAdvanced(postMtime, preMtimes[index] ?? Option.none());

      // The pass must NOT resume while a reviewer failed: retry the reviewer
      // IN PLACE (drop the poisoned session, recreate it with the next
      // fallback model, re-run the turn) until it completes or the attempt
      // budget is exhausted. `error but wrote` counts as success — the
      // scratch artifact is the completion marker.
      let attempts = 0;
      while (
        result.error !== undefined &&
        !wrote &&
        attempts < MAX_REVIEWER_ATTEMPTS - 1
      ) {
        runningCtx = yield* dropReviewerSession(runningCtx, profile.id);
        const recreated = yield* Effect.result(
          ensureReviewerSession(runningCtx, deps, config, profile),
        );
        if (Result.isFailure(recreated)) break;
        runningCtx = recreated.success;
        const session = runningCtx.reviewerSessions?.[profile.id];
        result =
          session === undefined
            ? { text: '', error: 'no session' }
            : yield* runReviewer(runningCtx, profile, outputPath, briefFile, session);
        postMtime = yield* mtimeMs(fileSystem, outputPath);
        wrote = fileAdvanced(postMtime, preMtimes[index] ?? Option.none());
        attempts++;
      }

      if (result.error !== undefined && !wrote) {
        yield* notify(
          ui,
          `Reviewer ${profile.id} failed after ${attempts + 1} attempt(s) (last error: ${result.error}) — the review pass will be retried.`,
          'error',
        );
        reviewerRows = reviewerRows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, status: 'error' as const } : row,
        );
        // A failed/timeout turn may have left the persistent session poisoned
        // (the generation could still be running — re-prompting it would hit
        // pi's busy error). Drop it so a retried pass recreates a fresh one.
        runningCtx = yield* dropReviewerSession(runningCtx, profile.id);
        continue;
      }

      // (error but wrote → treat as success, as before)
      // A TIMED-OUT turn poisons the session even when it wrote: the
      // generation may still be running, so never re-prompt that session.
      if (result.timedOut === true) {
        runningCtx = yield* dropReviewerSession(runningCtx, profile.id);
      }

      const content = yield* fileSystem
        .readFileString(outputPath, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));
      const findingCount = parseFindingBlocks(content).length;
      scratchFiles.push(outputPath);
      succeededIds.add(profile.id);
      reviewerRows = reviewerRows.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, status: 'done' as const, findingCount }
          : row,
      );
    }
    runningCtx = withWidget(runningCtx, { reviewers: reviewerRows });

    // EVERY reviewer must have completed before the pass may proceed to the
    // supervisor aggregate — a missing reviewer's lens would silently drop
    // findings from the canonical. Gate on all-succeeded, not any-succeeded:
    // a reviewer that failed after its in-pass retries fails the pass.
    const allSucceeded = config.reviewers.every((profile) => succeededIds.has(profile.id));
    if (!allSucceeded) {
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

    // ── Supervisor aggregate (always agent-driven, never programmatic) ──
    let canonicalMarkdown: string = '';
    const supervisorAgent = runningCtx.supervisor;
    if (supervisorAgent !== undefined) {
      runningCtx = withWidget(runningCtx, {
        supervisor: 'aggregating',
        phase: 'supervisor:aggregate',
      });
      yield* setStatus(
        ui,
        statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'supervisor:aggregate', 'running'),
      );

      const preAgg = yield* mtimeMs(fileSystem, reviewFile);
      const aggResult = yield* supervisorAgent.prompt(
        buildSupervisorAggregateTask(runningCtx, config, briefFile, loop + 1, cycle, scratchFiles),
        SUPERVISOR_TIMEOUT,
        toolProgress(runningCtx, 'supervisor aggregate'),
        agentDelta(runningCtx, 'supervisor', 'supervisor'),
      );
      const postAgg = yield* mtimeMs(fileSystem, reviewFile);
      canonicalMarkdown = yield* fileSystem
        .readFileString(reviewFile, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));

      // A timed-out aggregate may still be running on the session (abort is
      // best-effort) — treat it as a failed pass and retry on a fresh session
      // rather than re-prompting a possibly-busy agent.
      const aggTimedOut = aggResult.timedOut === true;
      if (
        aggTimedOut ||
        (aggResult.error !== undefined && !fileAdvanced(postAgg, preAgg)) ||
        canonicalMarkdown.trim() === ''
      ) {
        // Aggregation is agent-driven — never fall back to a programmatic
        // merge. Retry the pass; escalate after consecutive failures.
        yield* notify(
          ui,
          aggTimedOut
            ? `Supervisor aggregate timed out after ${SUPERVISOR_TIMEOUT}ms — retrying the review pass with a fresh session.`
            : `Supervisor aggregate failed (${aggResult.error ?? 'empty canonical'}) — retrying the review pass.`,
          'error',
        );
        const aggFailures = (runningCtx.reviewerConsecutiveFailures ?? 0) + 1;
        if (aggFailures >= MAX_CONSECUTIVE_FAILURES) {
          clearLoopWidget(ui);
          return {
            next: null,
            ctx: {
              ...runningCtx,
              reviewerConsecutiveFailures: aggFailures,
              terminal: 'failed' as const,
            },
          };
        }
        // Never re-prompt a session whose generation may still be running:
        // dispose it, advance to the next fallback model, and let the retry
        // recreate a fresh supervisor.
        const retryCtx = yield* dropSupervisor(runningCtx);
        return {
          next: 'review',
          ctx: { ...retryCtx, reviewerConsecutiveFailures: aggFailures },
        };
      }

      runningCtx = withWidget(runningCtx, {
        supervisor: 'done',
        phase: 'merge',
      });
    } else {
      yield* notify(ui, 'Internal error: supervisor missing for aggregate', 'error');
      clearLoopWidget(ui);
      return { next: null, ctx: { ...runningCtx, terminal: 'failed' as const } };
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
    // Mark the review phase complete so a resume jumps straight into the
    // fixer phase instead of re-running the reviewers.
    const reviewedState = { ...deadlockResult.state, phase: 'reviewed' as const };
    yield* saveLoopState(reviewFile, reviewedState);

    if (deadlockResult.newlyDeadlocked.length > 0) {
      yield* notify(
        ui,
        `[adversarial-review-loop] Deadlock escalated: ${deadlockResult.newlyDeadlocked.join(', ')}`,
        'warning',
      );
    }

    // The agent-written Summary must NOT drive the transition: LLMs miscount
    // statuses, so a Summary claiming `Open: 0` while an Open finding block
    // remains would falsely terminate the loop. Recompute the counts from the
    // actual finding blocks (mirroring the fixer node) and rewrite the
    // Summary section so the on-disk file matches the blocks.
    const findings = parseFindingBlocks(canonicalMarkdown);
    canonicalMarkdown = updateSummarySection(canonicalMarkdown, findings);
    yield* fileSystem.writeFileString(reviewFile, canonicalMarkdown);
    const summary = Option.some(countStatuses(findings));
    let nextCtx: GraphCtx = {
      ...runningCtx,
      summary,
      reviewerConsecutiveFailures: 0,
      loopState: reviewedState,
    };
    nextCtx = withWidget(nextCtx, {
      summary,
      deadlocks: deadlockResult.state.deadlocks.length,
      phase: 'reviewed',
      fixer: 'waiting' as FixerWidgetStatus,
    });

    const transition = transitionAfterReview({ summary });

    if (transition === 'consensus') {
      // The loop's reviewers agree there are no actionable issues — advance
      // to the next loop's fresh independent reviewers, or finish when all
      // configured loops are done.
      if (loop + 1 < config.maxLoops) {
        nextCtx = withWidget(nextCtx, {
          loopStatus: 'consensus',
          phase: 'consensus',
        });
        yield* notify(
          ui,
          `[adversarial-review-loop] Loop ${loop + 1} consensus — all findings resolved or dismissed. Advancing to loop ${loop + 2} with fresh reviewers.`,
          'info',
        );
        const advanced = yield* advanceLoop(nextCtx, config);
        return { next: 'review', ctx: advanced };
      }
      yield* setStatus(ui, '● adversarial-review-loop DONE');
      yield* notify(
        ui,
        '[adversarial-review-loop] Completed: all loops reached consensus — all findings resolved or dismissed.',
        'info',
      );
      clearLoopWidget(ui);
      return { next: null, ctx: { ...nextCtx, terminal: 'done' as const } };
    }

    if (transition === 'escalated') {
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
 * Builds the fixer task prompt.
 * @param {GraphCtx} ctx The current graph context
 * @returns The fixer task prompt
 */
/**
 * Result of one fixer agent attempt. `ok` carries the updated finding block
 * to merge; every other variant is a distinct, diagnosable failure so the
 * loop can report WHY a fixer produced no scratch block instead of
 * collapsing six different causes into one null.
 */
export type FixerOutcome =
  | { readonly kind: 'ok'; readonly block: string }
  | { readonly kind: 'session-error'; readonly reason: string }
  | { readonly kind: 'agent-error'; readonly reason: string }
  | { readonly kind: 'timeout'; readonly ms: number; readonly reason: string }
  | { readonly kind: 'scratch-missing'; readonly scratchPath: string }
  | {
      readonly kind: 'scratch-unparseable';
      readonly scratchPath: string;
      readonly preview: string;
    }
  | {
      readonly kind: 'wrong-id';
      readonly scratchPath: string;
      readonly got: string;
      readonly want: string;
    };

/** Persisted failure record for one fixer attempt (`fixes/<id>.error.json`). */
export interface FixerFailureRecord {
  readonly findingId: string;
  readonly loop: number;
  readonly cycle: number;
  readonly kind: string;
  readonly reason: string;
  readonly at: string;
}

/** Short reason label for a failure, used in wave aggregates. */
const fixerFailureShort = (outcome: FixerOutcome): string =>
  'reason' in outcome ? outcome.reason : outcome.kind;

/**
 * Builds the per-finding warning for a failed fixer attempt: names the
 * finding, the specific failure kind, and the expected scratch path.
 * @param {string} findingId The finding id
 * @param {FixerOutcome} outcome The failure outcome
 * @param {string} scratchPath The expected scratch path
 * @returns The notification message
 */
export const fixerFailureMessage = (
  findingId: string,
  outcome: FixerOutcome,
  scratchPath: string,
): string => {
  const unrecorded =
    'Any code fix it made is unrecorded and unverified — inspect the tree and re-dispatch or fix manually.';
  switch (outcome.kind) {
    case 'ok':
      return `Fixer for ${findingId} succeeded.`;
    case 'session-error':
      return `Fixer for ${findingId}: agent session failed (${outcome.reason}). No fix was attempted.`;
    case 'agent-error':
      return `Fixer for ${findingId}: agent run failed (${outcome.reason}). ${unrecorded}`;
    case 'timeout':
      return `Fixer for ${findingId}: timed out after ${outcome.ms}ms (${outcome.reason}). A fix may be partially applied — ${unrecorded}`;
    case 'scratch-missing':
      return `Fixer for ${findingId}: finished but wrote no scratch block (expected ${scratchPath}). ${unrecorded}`;
    case 'scratch-unparseable':
      return `Fixer for ${findingId}: scratch at ${scratchPath} is not a valid finding block (preview: ${JSON.stringify(outcome.preview)}). ${unrecorded}`;
    case 'wrong-id':
      return `Fixer for ${findingId}: wrote scratch for ${outcome.got} to ${scratchPath} (expected ${outcome.want}). ${unrecorded}`;
  }
};

/**
 * Reads a prior fixer failure record (`fixes/<id>.error.json`) for a finding,
 * or undefined when none exists / is unreadable / is malformed.
 * @param {FileSystem} fileSystem FileSystem service
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {string} findingId Finding id
 * @returns The failure record, or undefined
 */
const readFixerFailure = (
  fileSystem: FileSystem,
  reviewFile: string,
  loop: number,
  cycle: number,
  findingId: string,
): Effect.Effect<FixerFailureRecord | undefined, never, FileSystem> =>
  Effect.gen(function* () {
    const errorPath = fixerErrorPath(reviewFile, loop, cycle, findingId);
    const text = yield* fileSystem
      .readFileString(errorPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => null));
    if (text === null) return undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) return undefined;
      const record = parsed as Partial<FixerFailureRecord>;
      if (typeof record.findingId !== 'string' || typeof record.reason !== 'string') {
        return undefined;
      }
      return {
        findingId: record.findingId,
        loop: typeof record.loop === 'number' ? record.loop : 0,
        cycle: typeof record.cycle === 'number' ? record.cycle : 0,
        kind: typeof record.kind === 'string' ? record.kind : 'unknown',
        reason: record.reason,
        at: typeof record.at === 'string' ? record.at : '',
      };
    } catch {
      return undefined;
    }
  });

/**
 * Writes a fixer failure record next to the finding's scratch file so the
 * reason survives crashes, a later resume can hand it to the re-dispatched
 * fixer as context, and a human can see why.
 * @param {FileSystem} fileSystem FileSystem service
 * @param {string} reviewFile Absolute path to the canonical review file
 * @param {number} loop Loop number
 * @param {number} cycle Cycle number
 * @param {string} findingId Finding id
 * @param {FixerOutcome} outcome The failure outcome
 * @returns An effect writing the record (best-effort)
 */
const writeFixerFailure = (
  fileSystem: FileSystem,
  reviewFile: string,
  loop: number,
  cycle: number,
  findingId: string,
  outcome: FixerOutcome,
): Effect.Effect<void, never, FileSystem> =>
  fileSystem
    .writeFileString(
      fixerErrorPath(reviewFile, loop, cycle, findingId),
      `${JSON.stringify({
        findingId,
        loop,
        cycle,
        kind: outcome.kind,
        reason: 'reason' in outcome ? outcome.reason : outcome.kind,
        at: new Date().toISOString(),
      } satisfies FixerFailureRecord)}\n`,
    )
    .pipe(Effect.ignore);

/**
 * Builds a fixer task scoped to ONE finding. Fixers run in schedule waves
 * (parallel for unrelated findings), so the task is emphatic that the agent
 * writes ONLY its updated finding block to its scratch file — never the
 * shared review file, which other parallel fixers also read/write.
 * @param {GraphCtx} ctx The current graph context
 * @param {FindingBlock} finding The finding to resolve
 * @param {number} index 1-based index within the actionable findings
 * @param {number} total Total actionable findings
 * @param {string} scratchPath Where the agent must write its updated block
 * @returns The fixer task prompt
 */
const buildFindingFixerTask = (
  ctx: GraphCtx,
  finding: FindingBlock,
  index: number,
  total: number,
  scratchPath: string,
  prior?: {
    /** Reason the previous fixer attempt for this finding failed (if any). */
    readonly failureReason?: string;
    /** Content of the previous attempt's scratch file, when it exists. */
    readonly priorScratch?: string;
  },
): string => {
  const { reviewFile } = ctx;
  return (
    `Resolve finding ${finding.id} (${index}/${total}) in the review file at ${reviewFile}. ` +
    `Load and follow the addressing-adversarial-review skill at ${FIXER_SKILL_PATH} as your ` +
    `governing pipeline, but act on ONLY this finding. Other fixers are fixing other findings ` +
    `IN PARALLEL, so do NOT modify the review file — write your result to your own scratch file:\n\n` +
    `- ID: ${finding.id} — ${finding.title}\n` +
    `- Location: ${finding.location}\n` +
    `- Problem: ${finding.problem}\n` +
    `- Impact: ${finding.impact || '(see problem)'}\n` +
    `- Suggestion: ${finding.suggestion || '(see problem)'}\n` +
    `- Status: ${finding.status} · Attempts: ${finding.attempts}\n` +
    `- Discussion:\n${finding.discussion || '(none yet)'}\n\n` +
    (prior?.failureReason !== undefined
      ? `Prior attempt note: a previous fixer for this finding failed with "${prior.failureReason}".\n` +
        'It may have already edited the code. Inspect the cited file:line locations (git status/diff) ' +
        'before making changes — finish or correct that work instead of re-applying changes blindly.' +
        (prior.priorScratch !== undefined
          ? `\nPrior scratch content (may be incomplete or malformed):\n${prior.priorScratch}\n`
          : '') +
        '\n'
      : '') +
    'Steps:\n' +
    '1. Read the review file to see this finding\'s current block and Review Metadata (Max Attempts).\n' +
    '2. Triage per the skill: apply the minimal fix at the Location, increment Attempts, verify ' +
    "with the repo real checks (typecheck/lint/tests); or mark Won't Fix with a rationale turn; " +
    'or escalate at the Attempts ceiling.\n' +
    `3. Write the COMPLETE updated finding block for ${finding.id} — preserving its Severity, ` +
    'Location, Source, Problem, Impact, Suggestion and every prior Discussion turn verbatim, ' +
    'with the new ' +
    'Status/Attempts and your appended [Fixer] turn — to the scratch file at ' +
    `${scratchPath}.\n` +
    '4. Do NOT modify the review file or any other finding. Do not decide whether another ' +
    'review cycle should run.'
  );
};

/**
 * Runs one fixer agent for a finding: fixes the code, writes the updated
 * finding block to the finding's scratch file, and returns that block (or
 * null when the run failed / the scratch is missing or malformed).
 * @param {GraphCtx} ctx The current graph context
 * @param {GraphDeps} deps Injectable deps
 * @param {FindingBlock} finding The finding to resolve
 * @param {number} index 1-based index within the actionable findings
 * @param {number} total Total actionable findings
 * @param {string} reviewFile Canonical review path
 * @param {number} loop Current loop
 * @param {number} cycle Current cycle
 * @returns The updated finding block, or null on failure
 */
const runFindingFixer = (
  ctx: GraphCtx,
  deps: GraphDeps,
  finding: FindingBlock,
  index: number,
  total: number,
  reviewFile: string,
  loop: number,
  cycle: number,
): Effect.Effect<FixerOutcome, PlatformError, FileSystem | Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const run = deps.runAgent ?? runAgent;
    const scratchPath = fixerScratchPath(reviewFile, loop, cycle, finding.id);
    // NOT best-effort: a swallowed mkdir failure would make the fixer's scratch
    // write fail invisibly and the loop would record a confusing "fixer
    // failure" for a finding that never ran. Fail the node instead.
    yield* fileSystem.makeDirectory(dirname(scratchPath), { recursive: true });

    // Hand-off: a prior failed attempt for this finding gets its failure
    // reason + partial scratch fed to the next fixer so it can finish or
    // correct partial work instead of re-applying changes blindly.
    const priorFailure = yield* readFixerFailure(fileSystem, reviewFile, loop, cycle, finding.id);
    const priorScratch = yield* fileSystem
      .readFileString(scratchPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => ''));

    const task = buildFindingFixerTask(ctx, finding, index, total, scratchPath, {
      failureReason: priorFailure?.reason,
      priorScratch: priorScratch !== '' ? priorScratch : undefined,
    });
    // Retry/fallback: the fixer model chain (primary + configured fallbacks)
    // with per-model transient retries — a rate-limited primary falls back to
    // the next model instead of failing the finding. The aggregated error (all
    // models, with reasons) flows into the FixerOutcome below.
    const fixerConfig = configOf(ctx.opts);
    const models = [
      fixerConfig.fixerModel,
      ...(fixerConfig.fixerFallbackModels ?? []),
    ];
    const outcome = yield* Effect.result(
      runAgentResilient(
        run,
        models,
        (model) => ({
          model,
          systemPrompt: FIXER_SYSTEM,
          task,
          tools: TOOLS.fixer,
          cwd: ctx.cwd,
          onTool: fixerToolProgress(ctx, finding.id),
          onDelta: agentDelta(ctx, `fixer:${finding.id}`, `fixer ${finding.id}`),
        }),
        FIXER_TIMEOUT,
        deps.retryPolicy,
      ),
    );
    if (Result.isFailure(outcome)) {
      // Session creation / model resolution / auth failure — the agent never
      // ran, so there is no unrecorded code fix.
      return { kind: 'session-error', reason: outcome.failure.message };
    }

    const result = outcome.success;
    if (result.error !== undefined) {
      if (result.timedOut === true) {
        return { kind: 'timeout', ms: FIXER_TIMEOUT, reason: result.error };
      }
      return { kind: 'agent-error', reason: result.error };
    }

    // The run reported success — the scratch must parse as exactly this
    // finding's updated block. Distinguish the failure states so the node can
    // report WHY (missing vs malformed vs wrong-id). A block needs an explicit
    // Status field: `#### F1 — …` stubs parse with a defaulted status and must
    // NOT be accepted as a real updated block.
    const scratch = yield* fileSystem
      .readFileString(scratchPath, 'utf8')
      .pipe(Effect.orElseSucceed(() => ''));
    if (scratch.trim() === '') {
      return { kind: 'scratch-missing', scratchPath };
    }
    const parsed = parseFindingBlocks(scratch);
    const block = parsed[0];
    if (block === undefined || !/- \*\*Status\*\*:/.test(block.raw)) {
      return { kind: 'scratch-unparseable', scratchPath, preview: scratch.slice(0, 200) };
    }
    if (block.id !== finding.id) {
      return { kind: 'wrong-id', scratchPath, got: block.id, want: finding.id };
    }
    return { kind: 'ok', block: block.raw };
  });

/**
 * Fixer phase: the orchestrator builds a schedule from the Open findings
 * (same-location findings are related → sequential waves; different locations
 * share a wave → parallel), runs each wave's fixers concurrently, and merges
 * their per-finding scratch blocks into the canonical review file. Findings
 * with Status 'In Review' await the reviewer's verdict and are left alone
 * (per the addressing skill's triage). After every wave the summary is
 * refreshed and the loop transitions: back to the same reviewers for the next
 * cycle, or to the cycle-max decision point when the per-loop cap is hit.
 */
const fixer: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const { opts, ui, reviewFile } = ctx;
    if (reviewFile === undefined) {
      yield* notify(ui, 'Internal error: reviewFile not resolved', 'error');
      return { next: null, ctx: { ...ctx, terminal: 'failed' as const } };
    }

    const config = configOf(opts);
    const loop = ctx.loop ?? 0;
    const cycle = ctx.cycle ?? 0;
    const fileSystem = yield* FileSystem;

    let canonical = yield* fileSystem
      .readFileString(reviewFile, 'utf8')
      .pipe(Effect.orElseSucceed(() => ''));
    let actionable = parseFindingBlocks(canonical).filter(
      (finding) => finding.status === 'Open',
    );

    // Checkpoint recovery: an interrupted fixer phase (crash, escalation, or
    // a resume that jumps straight into this node) leaves per-finding scratch
    // files on disk. A valid scratch block for a still-Open finding means the
    // previous fixer finished writing but the merge never happened — merge it
    // now and skip re-dispatching. The block must carry an explicit Status
    // field (a stub like `#### F1 — …` parses with a defaulted status, and
    // must NOT clobber the canonical); anything else falls through to a fresh
    // dispatch, which gets the prior failure record as hand-off context.
    const recovered: string[] = [];
    for (const finding of actionable) {
      const scratchPath = fixerScratchPath(reviewFile, loop + 1, cycle, finding.id);
      const scratch = yield* fileSystem
        .readFileString(scratchPath, 'utf8')
        .pipe(Effect.orElseSucceed(() => ''));
      const block = parseFindingBlocks(scratch)[0];
      const recoverable =
        block !== undefined &&
        block.id === finding.id &&
        /- \*\*Status\*\*:/.test(block.raw);
      if (recoverable) {
        canonical = mergeFindingBlock(canonical, block.raw);
        recovered.push(finding.id);
      }
    }
    if (recovered.length > 0) {
      yield* notify(
        ui,
        `[adversarial-review-loop] Recovered ${recovered.length} fixer checkpoint(s) (${recovered.join(', ')}) from a previous interrupted pass — merged without re-dispatching.`,
        'info',
      );
      // Persist before the first wave so concurrently-fixed findings read
      // merged state (NOT best-effort; a swallowed write would re-fix them).
      yield* fileSystem.writeFileString(reviewFile, canonical);
      actionable = parseFindingBlocks(canonical).filter(
        (finding) => finding.status === 'Open',
      );
    }

    const schedule = buildFixerSchedule(actionable);
    // Widget rows: one per actionable finding, queued until its wave runs.
    const scheduleIds: readonly (readonly string[])[] = schedule.map((wave) =>
      wave.map((finding) => finding.id),
    );
    const allFixerRows: FixerWidgetRow[] = actionable.map((finding) => ({
      id: finding.id,
      status: 'queued' as const,
    }));

    let runningCtx = withWidget(ctx, {
      fixer: 'waiting',
      phase: 'fixer',
      // Fresh rows for THIS phase's findings — never the previous cycle's.
      fixers: allFixerRows,
    });
    yield* setStatus(
      ui,
      statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'fixer', 'running'),
    );

    let fixed = 0;
    const concurrency = config.agentConcurrency ?? DEFAULT_AGENT_CONCURRENCY;
    for (const [waveIndex, wave] of schedule.entries()) {
      // Graceful stop checkpoint: between waves.
      if (stopRequested(runningCtx)) return yield* stopResult(runningCtx);

      const phase = `fixer:wave ${waveIndex + 1}`;
      const waveIds = new Set(wave.map((finding) => finding.id));
      runningCtx = withWidget(runningCtx, {
        fixer: 'running',
        phase,
        fixerDetail: `wave ${waveIndex + 1}/${schedule.length} · fixed ${fixed}/${actionable.length}`,
        // The actual parallelism: the wave's size capped by the setting.
        fixerConcurrency: Math.min(wave.length, concurrency),
        fixers: (runningCtx.widget?.fixers ?? allFixerRows).map((row) =>
          waveIds.has(row.id) ? { ...row, status: 'running' as const } : row,
        ),
        fixerSchedule: scheduleIds,
        fixerWave: waveIndex + 1,
      });
      yield* setStatus(ui, statusLine(loop, config.maxLoops, cycle, config.maxCycles, phase, 'running'));

      // Run the wave's fixers with in-phase re-dispatch: a failed fixer must
      // NOT leave the phase incomplete. Each attempt notifies per-finding with
      // the SPECIFIC reason (F20 — a visible divergence, never a silent
      // no-op) and records it to fixes/<id>.error.json; a re-dispatched fixer
      // reads that record + any partial scratch as hand-off context. Findings
      // that still produced no valid block after MAX_FIXER_DISPATCH_ATTEMPTS
      // (across transient retries and every fallback model) escalate to a
      // human — the phase NEVER resumes with a failed finding.
      let pending = wave;
      const doneIds = new Set<string>();
      const lastFailures = new Map<string, FixerOutcome>();
      for (
        let attempt = 0;
        attempt < MAX_FIXER_DISPATCH_ATTEMPTS && pending.length > 0;
        attempt++
      ) {
        // Graceful stop checkpoint: between re-dispatch attempts too.
        if (stopRequested(runningCtx)) return yield* stopResult(runningCtx);
        const outcomes = yield* Effect.forEach(
          pending,
          (finding, findingIndex) =>
            runFindingFixer(
              runningCtx,
              deps,
              finding,
              fixed + findingIndex + 1,
              actionable.length,
              reviewFile,
              loop + 1,
              cycle,
            ),
          { concurrency },
        );

        const nextPending: FindingBlock[] = [];
        for (const [index, finding] of pending.entries()) {
          const outcome: FixerOutcome =
            outcomes[index] ?? {
              kind: 'agent-error',
              reason: 'No agent outcome produced',
            };
          if (outcome.kind === 'ok') {
            canonical = mergeFindingBlock(canonical, outcome.block);
            fixed++;
            doneIds.add(finding.id);
            continue;
          }
          const scratchPath = fixerScratchPath(reviewFile, loop + 1, cycle, finding.id);
          yield* notify(ui, fixerFailureMessage(finding.id, outcome, scratchPath), 'warning');
          lastFailures.set(finding.id, outcome);
          // Record the failure next to the scratch so a resume/human can see
          // why, and the re-dispatched fixer gets it as hand-off context.
          yield* writeFixerFailure(
            fileSystem,
            reviewFile,
            loop + 1,
            cycle,
            finding.id,
            outcome,
          );
          nextPending.push(finding);
        }
        pending = nextPending;
        if (pending.length > 0 && attempt < MAX_FIXER_DISPATCH_ATTEMPTS - 1) {
          yield* notify(
            ui,
            `Re-dispatching ${pending.length} failed fixer(s) (${pending.map((finding) => finding.id).join(', ')}) — attempt ${attempt + 2}/${MAX_FIXER_DISPATCH_ATTEMPTS}, with the prior failure as hand-off context.`,
            'info',
          );
          // Widget rows: re-running findings flip back to 'running'.
          runningCtx = withWidget(runningCtx, {
            fixers: (runningCtx.widget?.fixers ?? allFixerRows).map((row) =>
              doneIds.has(row.id)
                ? { ...row, status: 'done' as const }
                : pending.some((finding) => finding.id === row.id)
                  ? { ...row, status: 'running' as const }
                  : row,
            ),
          });
        }
      }

      // Residual failures after every attempt and fallback model: escalate.
      if (pending.length > 0) {
        const reasons = pending
          .map((finding) => {
            const failure = lastFailures.get(finding.id);
            return `${finding.id}: ${failure !== undefined ? fixerFailureShort(failure) : 'unknown'}`;
          })
          .join('; ');
        yield* notify(
          ui,
          `Fixer phase failed: ${pending.map((finding) => finding.id).join(', ')} could not be fixed after ` +
            `${MAX_FIXER_DISPATCH_ATTEMPTS} attempt(s) across all configured models — escalating to human. ` +
            `Reasons: ${reasons}. Details recorded next to each scratch file (fixes/<F>.error.json); ` +
            'inspect the tree for unrecorded code changes, then resume the review to re-dispatch.',
          'error',
        );
        yield* setStatus(ui, '● adversarial-review-loop FAILED');
        clearLoopWidget(ui);
        return {
          next: null,
          ctx: { ...runningCtx, terminal: 'failed' as const },
        };
      }

      // Reflect this wave's outcomes in the widget rows (done); queued rows
      // for later waves stay queued.
      runningCtx = withWidget(runningCtx, {
        fixers: (runningCtx.widget?.fixers ?? allFixerRows).map((row) =>
          doneIds.has(row.id) ? { ...row, status: 'done' as const } : row,
        ),
      });

      // Persist the merged canonical so the next wave's fixers read fresh state.
      // NOT best-effort: a swallowed write failure would make the next wave's
      // fixers read a stale on-disk file and the loop would merge on top of
      // diverged state. A failure here fails the node (runGraph marks 'failed').
      yield* fileSystem.writeFileString(reviewFile, canonical);
    }

    // Refresh the summary counts from the merged findings and transition.
    canonical = updateSummarySection(canonical, parseFindingBlocks(canonical));
    // NOT best-effort: postFix is computed by re-parsing this file, so a
    // swallowed write failure would transition on stale pre-merge counts.
    yield* fileSystem.writeFileString(reviewFile, canonical);

    const postFix = yield* parseSummary(reviewFile);
    runningCtx = withWidget(
      { ...runningCtx, summary: postFix },
      { fixer: 'done', summary: postFix, phase: 'fixed' },
    );

    // Mark the fixer phase complete in loop-state so a resume after a crash
    // here does not re-run the reviewers (phase 'fixed' → resume at 'review').
    if (reviewFile !== undefined && runningCtx.loopState !== undefined) {
      const fixedState = { ...runningCtx.loopState, phase: 'fixed' as const };
      yield* saveLoopState(reviewFile, fixedState);
      runningCtx = { ...runningCtx, loopState: fixedState };
    }

    const next = transitionAfterFixer({ cycle, maxCycles: config.maxCycles });
    if (next === 'cycleMax') {
      // Same reviewers hit the per-loop cycle cap without consensus — the
      // cycleMaxDecision node asks the user (increase cycles / next loop / add
      // a loop / stop). Headless runs terminate 'maxLoops' there.
      return { next: 'cycleMaxDecision', ctx: { ...runningCtx } };
    }

    return { next: 'review', ctx: { ...runningCtx } };
  });

/**
 * Cycle-max decision point: the current loop reached its per-loop cycle cap
 * without consensus (unresolved findings remain). The user chooses to raise
 * the cycle cap and keep the same reviewers, advance to the next loop (fresh
 * independent reviewers; "Add a new loop" when already at the loop cap), or
 * stop. Without an `askUser` implementation (headless/tests) the loop
 * terminates `maxLoops`.
 */
const cycleMaxDecision: GraphNode = (ctx, deps) =>
  Effect.gen(function* () {
    const config = configOf(ctx.opts);
    const loop = ctx.loop ?? 0;
    const cycle = ctx.cycle ?? 0;
    const summary = ctx.summary ?? Option.none();
    const open = Option.isSome(summary) ? summary.value.open : 0;
    const inReview = Option.isSome(summary) ? summary.value.inReview : 0;
    const escalated = Option.isSome(summary) ? summary.value.escalated : 0;
    const atLoopMax = loop + 1 >= config.maxLoops;
    const options: readonly string[] = atLoopMax
      ? ['Increase cycle max', 'Add a new loop', 'Stop']
      : ['Increase cycle max', 'Resume to NEXT loop', 'Stop'];

    if (deps.askUser === undefined) {
      yield* notify(
        ctx.ui,
        `[adversarial-review-loop] Loop ${loop + 1} reached the cycle cap (${config.maxCycles}) without consensus — ` +
          `open ${open} · in-review ${inReview} · escalated ${escalated}. Review file: ${ctx.reviewFile}`,
        'warning',
      );
      yield* setStatus(ctx.ui, '● adversarial-review-loop MAX LOOPS');
      clearLoopWidget(ctx.ui);
      return { next: null, ctx: { ...ctx, terminal: 'maxLoops' as const } };
    }

    withWidget(ctx, {
      loopStatus: 'decision',
      decision: `cycle ${cycle}/${config.maxCycles} reached — waiting on you`,
      phase: 'decision',
    });
    yield* setStatus(
      ctx.ui,
      statusLine(loop, config.maxLoops, cycle, config.maxCycles, 'decision', 'waiting on user'),
    );

    const question =
      `Loop ${loop + 1}/${config.maxLoops} reached cycle ${cycle}/${config.maxCycles} without consensus ` +
      `(open ${open} · in-review ${inReview} · escalated ${escalated}). What next?`;
    const askUser = deps.askUser;
    const choice = yield* Effect.promise(() => askUser(question, options));

    if (choice === 'Increase cycle max') {
      const maxCycles = config.maxCycles + 1;
      const newConfig = { ...config, maxCycles };
      const state = ctx.loopState !== undefined ? { ...ctx.loopState, config: newConfig } : ctx.loopState;
      if (ctx.reviewFile !== undefined && state !== undefined) {
        yield* saveLoopState(ctx.reviewFile, state);
      }
      yield* notify(
        ctx.ui,
        `[adversarial-review-loop] Cycle cap raised to ${maxCycles} — continuing loop ${loop + 1} with the same reviewers.`,
        'info',
      );
      return {
        next: 'review',
        ctx: {
          ...ctx,
          loopState: state,
          opts: { ...ctx.opts, config: newConfig },
        },
      };
    }

    if (choice === 'Resume to NEXT loop' || choice === 'Add a new loop') {
      let effectiveCtx = ctx;
      if (choice === 'Add a new loop') {
        const newConfig = { ...config, maxLoops: config.maxLoops + 1 };
        const state =
          ctx.loopState !== undefined ? { ...ctx.loopState, config: newConfig } : ctx.loopState;
        if (ctx.reviewFile !== undefined && state !== undefined) {
          yield* saveLoopState(ctx.reviewFile, state);
        }
        yield* notify(
          ctx.ui,
          `[adversarial-review-loop] Added a new loop — max loops is now ${newConfig.maxLoops}.`,
          'info',
        );
        effectiveCtx = {
          ...ctx,
          loopState: state,
          opts: { ...ctx.opts, config: newConfig },
        };
      }
      const advanced = yield* advanceLoop(effectiveCtx, configOf(effectiveCtx.opts));
      return { next: 'review', ctx: advanced };
    }

    // Stop (or Esc — null means cancel).
    yield* notify(ctx.ui, '[adversarial-review-loop] Stopped by user decision.', 'info');
    yield* setStatus(ctx.ui, undefined);
    clearLoopWidget(ctx.ui);
    return { next: null, ctx: { ...ctx, terminal: 'stopped' as const } };
  });

const NODES: Record<string, GraphNode> = {
  skillGate,
  resolveCtx,
  review,
  fixer,
  cycleMaxDecision,
};

/**
 * Runs the adversarial-review-loop state machine until a terminal node.
 * Node errors that escape fine-grained handling are caught here: the user is
 * notified and the loop terminates as failed. Reviewers are fresh each cycle.
 * The supervisor is one persistent session for the whole loop and is
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
            // Keep the default when the caller omitted fixerModel — an
            // unguarded undefined here would later surface as a confusing
            // "Cannot read properties of undefined" model-resolution error.
            fixerModel: ctx.opts.fixerModel ?? fallback.fixerModel,
            maxLoops: ctx.opts.maxLoops,
            maxCycles: ctx.opts.maxCycles ?? fallback.maxCycles,
            reviewers: [{ ...generic, model: ctx.opts.reviewerModel }],
          },
        },
      };
    }

    if (ctx.supervisorHolder === undefined) {
      ctx = { ...ctx, supervisorHolder: {} };
    }

    // Live agent streams: one shared store for the whole run, plus the active
    // handle the focus command (/adversarial-review-loop-focus) reads/re-pushes.
    const streams = ctx.streams ?? new StreamStore();
    const fixerActivity = ctx.fixerActivity ?? new FixerActivityStore();
    ctx = { ...ctx, streams, fixerActivity };
    activeLoop = {
      streams,
      ui: ctx.ui,
      focused: undefined,
      widget: ctx.widget,
      reviewFile: ctx.reviewFile,
    };

    // herdr visibility: the loop's agents run in background sessions while
    // the main pi session stays idle, so herdr would show the pane as idle
    // mid-loop. Report `working` directly to herdr's pane (heartbeat-refreshed
    // with the current phase), and `idle` when the loop ends.
    const herdrActive = herdrEnabled();
    const herdrConfig = configOf(ctx.opts);
    const herdrMessage = (): string => {
      const widget = ctx.widget;
      return widget !== undefined
        ? `[loop ${widget.loop + 1}/${widget.maxLoops} · cycle ${widget.cycle + 1}/${widget.maxCycles}] ${phaseLabel(widget.phase)}`
        : `[loop 1/${herdrConfig.maxLoops} · cycle 1/${herdrConfig.maxCycles}] starting`;
    };
    const herdrTimer = herdrActive
      ? setInterval(() => {
          void reportHerdrState('working', herdrMessage());
        }, HERDR_HEARTBEAT_MS)
      : undefined;
    herdrTimer?.unref?.();
    if (herdrActive) {
      void reportHerdrState('working', herdrMessage());
    }

    let next: string | null = 'skillGate';

    const loop = Effect.gen(function* () {
      while (next !== null) {
        // Graceful stop checkpoint: between nodes/cycles.
        if (stopRequested(ctx)) {
          const stopped = yield* stopResult(ctx);
          return stopped.ctx;
        }

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
          if (herdrTimer !== undefined) clearInterval(herdrTimer);
          if (herdrActive) {
            yield* Effect.promise(() => reportHerdrState('idle'));
          }
          activeLoop = undefined;
          clearLoopWidget(ctx.ui);
          const supervisor = ctx.supervisorHolder?.current ?? ctx.supervisor;
          if (supervisor !== undefined) {
            yield* supervisor.dispose();
          }
          // Dispose every persistent per-loop reviewer session (the current
          // loop's set, plus any stale ones registered in holders).
          const reviewerSessions = Object.values(ctx.reviewerSessions ?? {});
          for (const session of reviewerSessions) {
            yield* session.dispose().pipe(Effect.ignore);
          }
          for (const holder of Object.values(ctx.reviewerHolders ?? {})) {
            if (holder.current !== undefined) {
              yield* holder.current.dispose().pipe(Effect.ignore);
            }
          }
        }),
      ),
    );
  });
