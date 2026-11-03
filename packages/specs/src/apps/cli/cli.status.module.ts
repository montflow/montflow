import { Clock, Console, Effect, FileSystem, Option } from 'effect';
import { Command } from 'effect/cli';

import { type Spec, parseSpecFile, readSpecVersion } from '../../modules/spec/index.js';
import { parseMarkdown } from '../../modules/frontmatter/index.js';
import {
  type Analysis,
  type State,
  analyze as analyzeLifecycle,
} from '../../modules/lifecycle/index.js';

import { SIZES, phaseReviewBudget, resolve as resolveSizing } from '../../modules/sizing/index.js';
import {
  type ReviewInput,
  type SpecSnapshot,
  reviewedPhasesOf,
  verifySpecTree,
} from '../../modules/structure/index.js';
import type { SeriesSnapshot } from '../../modules/review-link/index.js';
import {
  Task,
  parseTaskDirName,
  phaseOf,
  phaseRank,
  sortKey,
  writeScopeTokens,
} from '../../modules/task/index.js';
import { type PhaseStatus, parsePhaseFile, phaseEvidence } from '../../modules/phase/index.js';
import { parseGates } from '../../modules/gates/index.js';
import {
  GATE_CONFIG_FILE,
  type RunSummary,
  lastAttempt,
  parseGateConfig,
  runSummary,
} from '../../modules/scheduler/index.js';
import { type Result, errorCount, isWarning, warningCount } from '../../modules/verify/index.js';
import { renderDiagnostic } from '../../modules/diagnostic/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  VALIDATION_EXIT_CODE,
  SurfaceError,
  diagnosticOfIssue,
  indentBlock,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  type SizingLoad,
  NO_SIZING,
  loadSizing,
  runDiagnosed,
  verboseFlag,
  dirFlag,
  nameFlag,
  workspaceOf,
} from './cli.shared.module.js';
import {
  tasksOf,
  unknownSpecDiagnostic,
  dispatchBlocked,
  phaseSizes,
  budgetInput,
  configSet,
  taskSizeErrors,
  taskTarget,
  targetColumns,
  dispatchErrors,
  type TaskTarget,
  dispatchExitCode,
  dispatchErrorText,
  configFilesLine,
} from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

/**
 * One phase's derived record view: the `PHASE.md` review decision and gate
 * kind beside the lock the lifecycle derives from completion, proof, and review.
 * A v1 phase has no record, so its decision fields stay undefined.
 */
export interface PhaseView {
  readonly phase: string;
  readonly review: 'required' | 'waived' | undefined;
  readonly reviewReason?: string | undefined;
  readonly gate: 'none' | 'mechanical' | 'subjective' | undefined;
  readonly status: PhaseStatus | undefined;
  /** Derived lock; never read from a stored list. */
  readonly locked: boolean;
  /** True when every classified mechanical stage has a latest pass. */
  readonly proven: boolean;
  /** True when the phase declares an effective `PHASE.md` waiver. */
  readonly waived: boolean;
}

/** Mutable builder for one {@link PhaseView}, so an absent reason stays absent. */
interface MutablePhaseView {
  phase: string;
  review: PhaseView['review'];
  reviewReason?: string;
  gate: PhaseView['gate'];
  status: PhaseStatus | undefined;
  locked: boolean;
  proven: boolean;
  waived: boolean;
}

export interface StatusReport {
  readonly name: string;
  readonly spec: Spec | undefined;
  readonly tasks: ReadonlyArray<Task>;
  /** Derived lifecycle analysis; undefined when SPEC.md does not parse. */
  readonly state: Analysis | undefined;
  readonly verify: Result;
  /** Loaded sizing layers and the config files found. */
  readonly sizing: SizingLoad;
  /** Task ids carrying a `GATES.md`, derived from the snapshot. */
  readonly gatedTaskIds?: ReadonlySet<string>;
  /** Phase id → its `GATES.md` contents, for the boundary gate annotation. */
  readonly phaseGates?: ReadonlyMap<string, string>;
  /** Per-phase `PHASE.md` decision and derived lock/gate state. */
  readonly phases?: ReadonlyArray<PhaseView>;
  /** Workspace run states, read by `status` and `next`. */
  readonly runs?: RunSummary;
}

/**
 * Build the per-phase view from the phase records, the evidence derived from
 * their gates, and the lifecycle's derived locks. Phase ids come from the
 * `PHASE.md` directories and from the task tree, so a v1 phase still appears
 * without a record and a v2 phase with no tasks still appears with its review
 * decision.
 * @param snapshot - every file under the spec root
 * @param evidence - waived/proven sets derived by `phaseEvidence`
 * @param state - the lifecycle analysis, when SPEC.md parses
 * @returns one view per phase, in phase-rank order
 */
export const phaseViews = (
  snapshot: SpecSnapshot,
  evidence: { readonly waived: ReadonlyArray<string>; readonly proven: ReadonlyArray<string> },
  state: Analysis | undefined,
): ReadonlyArray<PhaseView> => {
  const found = new Map<string, string>();
  for (const file of snapshot.files) {
    if ((file.kind ?? 'file') !== 'file') continue;
    const match = /^([A-Z]{1,2})\/PHASE\.md$/.exec(file.path);
    if (match !== null && match[1] !== undefined) found.set(match[1], file.content);
  }
  const ids = new Set<string>([
    ...found.keys(),
    ...(state?.phases.map((summary) => summary.phase) ?? []),
  ]);
  return [...ids]
    .toSorted((left, right) => phaseRank(left) - phaseRank(right))
    .map((phase) => {
      const markdown = found.get(phase);
      const record = markdown === undefined ? undefined : parsePhaseFile(markdown);
      const view: MutablePhaseView = {
        phase,
        review: record?.review,
        gate: record?.gate,
        status: record?.status,
        locked: state?.phases.find((summary) => summary.phase === phase)?.locked === true,
        proven: evidence.proven.includes(phase),
        waived: evidence.waived.includes(phase),
      };
      if (record?.reviewReason !== undefined) view.reviewReason = record.reviewReason;
      return view;
    });
};

/** Render one phase's review decision for the status and state lines. */
export const phaseReviewText = (phase: PhaseView): string =>
  phase.review === undefined
    ? 'review none'
    : phase.review === 'waived' && phase.reviewReason !== undefined
      ? `review waived: ${phase.reviewReason}`
      : `review ${phase.review}`;

/** Render one phase's gate state: kind plus derived proof. */
export const phaseGateText = (phase: PhaseView): string => {
  if (phase.gate === undefined) return 'gate none';
  if (phase.gate === 'none') return 'gate none';
  return `gate ${phase.gate} ${phase.proven ? 'proven' : 'unproven'}`;
};

/** Task ids carrying a `GATES.md`, read from the nested task directory. */
export const gatedTaskIds = (snapshot: SpecSnapshot): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const file of snapshot.files) {
    const segments = file.path.split('/');
    if (segments.length !== 3 || segments[2] !== 'GATES.md') continue;
    const parsed = parseTaskDirName(segments[1] ?? '');
    if (parsed !== undefined) ids.add(parsed.id);
  }
  return ids;
};

/** Phase id → the contents of its `GATES.md`, when it has one. */
export const phaseGateFiles = (snapshot: SpecSnapshot): ReadonlyMap<string, string> => {
  const gates = new Map<string, string>();
  for (const file of snapshot.files) {
    if ((file.kind ?? 'file') !== 'file') continue;
    const match = /^([A-Z]{1,2})\/GATES\.md$/.exec(file.path);
    if (match !== null && match[1] !== undefined) gates.set(match[1], file.content);
  }
  return gates;
};

/**
 * Reduce one spec snapshot to a {@link StatusReport}. Pure over the
 * snapshot and the review series, so `status`, `next`, and `list` share the
 * same summarizer — and the same review input — as `check`. `spec` / `state`
 * are undefined when SPEC.md is missing or unparsable.
 * @param name - spec directory name
 * @param snapshot - every file under the spec root
 * @param review - the linked review series, already read from the store
 * @param sizing - loaded config layers; defaults to no config files
 * @returns the status report
 */
export const summarize = (
  name: string,
  snapshot: SpecSnapshot,
  review: ReadonlyArray<SeriesSnapshot>,
  sizing: SizingLoad = NO_SIZING,
): StatusReport => {
  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : parseSpecFile(specFile.content);
  const parsedSpec = specFile === undefined ? null : parseMarkdown(specFile.content);
  const specVersion = parsedSpec === null ? undefined : readSpecVersion(parsedSpec.fields).version;
  const ordered = tasksOf(snapshot);
  const reviewInput: ReviewInput = { series: review, requireRounds: false, available: true };
  const evidence = phaseEvidence(snapshot);
  const state =
    spec === undefined
      ? undefined
      : analyzeLifecycle({
          status: spec.status,
          reviewedPhases: reviewedPhasesOf(snapshot, reviewInput),
          waivedPhases: evidence.waived,
          provenPhases: evidence.proven,
          tasks: ordered.map((task) => ({ id: task.id, status: task.status })),
          // A complete v2 record must agree with its derived locks; a frozen v1
          // record keeps the status-only rule it shipped with.
          requireLocks: specVersion !== undefined && specVersion >= 2,
        });
  return {
    name,
    spec,
    tasks: ordered,
    state,
    verify: verifySpecTree(snapshot, reviewInput),
    sizing,
    gatedTaskIds: gatedTaskIds(snapshot),
    phaseGates: phaseGateFiles(snapshot),
    phases: phaseViews(snapshot, evidence, state),
  };
};

/**
 * Read one spec and summarize it. Fails on IO, on a missing root, and with the
 * coded `spec.not-found` diagnostic when the spec does not exist.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the status report
 */
export const status = (
  root: string,
  name: string,
): Effect.Effect<
  StatusReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    yield* guardFailure('SpecStatus', guardSpecName(name, GUARD_RERUN.status));
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecStatus',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation: 'SpecStatus', diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    // The review series is part of the tree verdict: `status`, `next`, and
    // `execute` read it exactly like `check`, so an over-budget phase is
    // undispatchable everywhere instead of only failing the gate.
    const review = yield* store.reviewSeries(root, name);
    const sizing = yield* loadSizing(root, name, snapshot);
    const summary = summarize(name, snapshot, review, sizing);
    const workspace = workspaceOf(root);
    const fs = yield* FileSystem.FileSystem;
    const configText = yield* fs
      .readFileString(`${workspace.replace(/\/+$/, '')}/${GATE_CONFIG_FILE}`)
      .pipe(Effect.option);
    const lanes = parseGateConfig(Option.isNone(configText) ? undefined : configText.value).config
      .heavy.lanes;
    const runs = yield* runSummary(workspace, yield* Clock.currentTimeMillis, lanes);
    return { ...summary, runs };
  });

/** Per-status display mark, kept terse for token efficiency. */
export const STATUS_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
} satisfies Record<string, string>;

export const statusCounts = (tasks: ReadonlyArray<Task>): string =>
  (['complete', 'in-progress', 'pending', 'blocked'] as const)
    .map((taskStatus) => ({
      status: taskStatus,
      count: tasks.filter((task) => task.status === taskStatus).length,
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.status}`)
    .join(' \u00b7 ');

/** Elapsed whole seconds since an instant, or 0 when it is unparsable. */
const elapsedSeconds = (at: string | undefined, now: number): number => {
  if (at === undefined) return 0;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? 0 : Math.max(0, Math.round((now - parsed) / 1000));
};

/**
 * Render the workspace run panel: one summary line, then one line per run with
 * its key, lane occupancy, owner task, state, and elapsed time.
 * @param runs - summary read from the workspace runtime tree
 * @returns the display lines
 */
export const renderRuns = (runs: RunSummary): ReadonlyArray<string> => {
  const lines: Array<string> = [
    `runs ${runs.inFlight} in-flight \u00b7 ${runs.queued} queued \u00b7 ${runs.stale} stale`,
  ];
  for (const run of runs.runs) {
    const attempt = lastAttempt(run);
    lines.push(
      `run ${run.key} ${run.lane} ${runs.inFlight}/${runs.lanes} ${attempt?.owner.task ?? 'phase'} ${run.state} ${elapsedSeconds(attempt?.startedAt, runs.at)}s`,
    );
  }
  return lines;
};

/**
 * Render a human-readable status panel for one spec.
 * @param report - report from {@link status}
 * @returns the display text
 */
export const renderStatus = (report: StatusReport): string => {
  const lines: Array<string> = [];
  const spec = report.spec;
  if (spec === undefined) {
    lines.push(`${report.name} \u00b7 unreadable SPEC.md`);
  } else {
    lines.push(`${spec.name} \u00b7 ${spec.status} \u00b7 ${spec.workspaceType}`);
    if (report.state !== undefined) lines.push(`state ${report.state.state}`);
    const lockedPhases = (report.state?.phases ?? [])
      .filter((phase) => phase.locked)
      .map((phase) => phase.phase);
    const locked = lockedPhases.length > 0 ? ` \u00b7 locked ${lockedPhases.join(',')}` : '';
    lines.push(`author ${spec.author} \u00b7 created ${spec.created}${locked}`);
  }
  lines.push(
    `tasks ${report.tasks.length}${report.tasks.length > 0 ? ` \u00b7 ${statusCounts(report.tasks)}` : ''}`,
  );
  const errors = errorCount(report.verify.issues);
  const warnings = warningCount(report.verify.issues);
  const warningSuffix =
    warnings === 0 ? '' : ` \u00b7 ${warnings} warning${warnings === 1 ? '' : 's'}`;
  lines.push(
    `verify ${errors === 0 ? '\u2713 verified' : `\u2717 ${errors} issue${errors === 1 ? '' : 's'}`}${warningSuffix}`,
  );
  for (const found of report.verify.issues) {
    if (!isWarning(found)) continue;
    if (found.code === undefined) {
      lines.push(`  ! ${found.field}: ${found.message}`);
      if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
      continue;
    }
    lines.push(
      ...indentBlock(
        renderDiagnostic(
          diagnosticOfIssue(report.name, found, `mf-specs check --name ${report.name}`),
        ),
        '  ',
      ).split('\n'),
    );
  }
  if (report.state !== undefined && report.state.state === 'inconsistent') {
    for (const found of report.state.issues) lines.push(`  ${found.field}: ${found.message}`);
  }

  const sizingErrors = errorCount(report.sizing.issues);
  const configOk = sizingErrors === 0;
  const blocked = dispatchBlocked(report.sizing, report.verify, report.name);
  lines.push(
    configOk
      ? configFilesLine(report.sizing)
      : `sizing \u2717 ${sizingErrors} issue${sizingErrors === 1 ? '' : 's'}`,
  );
  if (report.runs !== undefined) lines.push(...renderRuns(report.runs));

  const tasksByPhase = new Map<string, Array<Task>>();
  for (const task of report.tasks) {
    const phase = phaseOf(task.id);
    const bucket = tasksByPhase.get(phase) ?? [];
    bucket.push(task);
    tasksByPhase.set(phase, bucket);
  }
  const views = new Map((report.phases ?? []).map((view) => [view.phase, view]));
  const phaseIds = [...new Set([...views.keys(), ...tasksByPhase.keys()])].toSorted(
    (left, right) => phaseRank(left) - phaseRank(right),
  );
  for (const phase of phaseIds) {
    const tasks = tasksByPhase.get(phase) ?? [];
    const view = views.get(phase);
    const locked = view?.locked === true;
    const sizes = phaseSizes(tasks);
    // A v2 phase shows its PHASE.md decision and derived gate state beside the
    // live lock; a v1 phase with no record keeps the original header shape.
    const decision =
      view !== undefined && view.review !== undefined
        ? ` \u00b7 ${phaseReviewText(view)} \u00b7 ${phaseGateText(view)}`
        : '';
    lines.push('');
    lines.push(
      `Phase ${phase}${locked ? ' \u00b7 locked' : ''}${decision} \u00b7 budget ${phaseReviewBudget(tasks.map(budgetInput))}${sizes.length === 0 ? '' : ` \u00b7 sizes ${sizes.join(',')}`}`,
    );
    if (!blocked) {
      lines.push(
        `  sizes ${SIZES.map((size) => `${size} ${resolveSizing(configSet(report.sizing, phase), size).target}`).join(' \u00b7 ')}`,
      );
    }
    for (const task of tasks) {
      // A task whose own size is missing or unknown gets no target, while a
      // valid sibling in the same phase keeps its columns.
      const target =
        !blocked && taskSizeErrors(task).length === 0 ? taskTarget(report.sizing, task) : undefined;
      lines.push(
        `  ${STATUS_MARK[task.status] ?? '?'} ${task.id}  ${task.name.padEnd(24)} ${task.type}${targetColumns(target)}`,
      );
    }
  }
  return lines.join('\n');
};

// ─── State / Next ─────────────────────────────────────────────────────

/** Compact derived-state report the orchestrator reads before acting. */
export interface StateReport {
  readonly name: string;
  readonly declared: string;
  readonly state: State;
  /** Active phase: the first unlocked phase with unfinished work, if any. */
  readonly phase: string | undefined;
  /** Derived locks: complete phases with a passed review round. */
  readonly lockedPhases: ReadonlyArray<string>;
  /** Per-phase `PHASE.md` decision and derived lock/gate state. */
  readonly phases?: ReadonlyArray<PhaseView>;
  /** True when an error `check` reports blocks dispatch of this spec. */
  readonly blocked: boolean;
  /**
   * Codes of the errors blocking dispatch, sorted and unique. Present so the
   * compact line can name *why* it exits non-zero instead of contradicting its
   * own exit code with a clean-looking `state complete`.
   */
  readonly blockers: ReadonlyArray<string>;
}

/**
 * Reduce one status report to the compact state an orchestrator acts on:
 * the declared status, the derived lifecycle state, the active phase, the
 * locked phases, whether the tree blocks dispatch, and the codes that block it.
 * `inconsistent` means the bookkeeping contradicts itself, which the caller
 * repairs before dispatching anything; `blocked` means `check` reports an error
 * for the same tree.
 * @param report - status report for one spec
 * @returns the compact state report
 */
export const stateOf = (report: StatusReport): StateReport => ({
  name: report.name,
  declared: report.spec?.status ?? 'unreadable',
  state: report.state?.state ?? 'inconsistent',
  phase: activePhaseOf(report),
  lockedPhases: (report.state?.phases ?? [])
    .filter((phase) => phase.locked)
    .map((phase) => phase.phase),
  phases: report.phases ?? [],
  blocked: dispatchBlocked(report.sizing, report.verify, report.name),
  blockers: [
    ...new Set(
      dispatchErrors(report.sizing, report.verify, report.name).map(
        (found) => found.code ?? 'unspecified',
      ),
    ),
  ].toSorted(),
});

/**
 * Reduce one spec to the derived state an orchestrator acts on, together with
 * the status report it was derived from. The shared name guard runs first, so a
 * malformed name is refused before the first store read and the refusal names
 * `state` as the command to re-run. One read feeds both the compact line and the
 * full blocker blocks, so they can never disagree.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the compact state report and the status report behind it
 */
export const stateWithReport = (
  root: string,
  name: string,
): Effect.Effect<
  { readonly report: StatusReport; readonly state: StateReport },
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    yield* guardFailure('SpecState', guardSpecName(name, GUARD_RERUN.state));
    const report = yield* status(root, name);
    return { report, state: stateOf(report) };
  });

/**
 * Reduce one spec to the derived state an orchestrator acts on. The shared name
 * guard runs first, so a malformed name is refused before the first store read
 * and the refusal names `state` as the command to re-run.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the compact state report
 */
export const state = (
  root: string,
  name: string,
): Effect.Effect<
  StateReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> => stateWithReport(root, name).pipe(Effect.map((found) => found.state));

/** The active phase from a status report: first unlocked phase with unfinished work. */
export const activePhaseOf = (report: StatusReport): string | undefined =>
  report.state?.phases.find((phase) => !phase.locked && phase.complete < phase.total)?.phase;

/**
 * Render the compact state line the orchestrator reads. A blocked spec keeps the
 * one-line shape on success and names the codes `check` reports plus the command
 * that explains them, so the exit code never contradicts a clean-looking line.
 * @param report - report from {@link state}
 * @returns the status line, plus `blocked` and `next` lines when blocked
 */
export const renderState = (report: StateReport): string => {
  const phase = report.phase === undefined ? 'none' : report.phase;
  const locked = report.lockedPhases.length === 0 ? 'none' : report.lockedPhases.join(',');
  // Show the active phase's PHASE.md decision and derived gate proof. A v1
  // phase has no record, so its line keeps the original compact shape.
  const views = report.phases ?? [];
  const shown =
    report.phase === undefined
      ? views.findLast((view) => view.review !== undefined)
      : views.find((view) => view.phase === report.phase);
  const decision =
    shown === undefined || shown.review === undefined
      ? ''
      : ` · review ${shown.phase}:${shown.review}${shown.reviewReason === undefined ? '' : ` (${shown.reviewReason})`} · ${phaseGateText(shown)}`;
  const line = `${report.name} · ${report.declared} · state ${report.state} · phase ${phase} · locked ${locked}${decision}`;
  if (!report.blocked) return line;
  const codes = report.blockers.length === 0 ? 'unspecified' : report.blockers.join(', ');
  return `${line} · blocked ${codes}\nnext mf-specs status --name ${report.name}`;
};

/** One task the orchestrator may start now. */
export interface ReadyTask {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** True when the task carries a per-task `GATES.md` that must pass first. */
  readonly gates: boolean;
  /** Declared `write-scope` tokens, or undefined when the task declares none. */
  readonly writeScope?: ReadonlyArray<string> | undefined;
  /** Declared size, resolved target, and winning layer. */
  readonly sizing: TaskTarget;
}

/** The ready set for the active phase, plus the state it was derived from. */
export interface NextReport {
  readonly name: string;
  readonly state: State;
  readonly phase: string | undefined;
  /** Review budget of the active phase; absent when there is no active phase. */
  readonly budget: number | undefined;
  /** Tasks ready to start: pending, dependencies complete, review last. */
  readonly ready: ReadonlyArray<ReadyTask>;
  /** Tree verification, so a task-size error can block dispatch. */
  readonly verify: Result;
  /** Loaded sizing layers for target resolution. */
  readonly sizing: SizingLoad;
  /** Per-phase `PHASE.md` decision and derived lock/gate state. */
  readonly phases?: ReadonlyArray<PhaseView>;
  /** Phase id → its `GATES.md` contents. */
  readonly phaseGates?: ReadonlyMap<string, string>;
  /** Workspace run states, read for the run panel. */
  readonly runs?: RunSummary;
}

/**
 * Derive the ready set, active phase, and budget from an existing status
 * report, without any store read. `next` and `execute` share this so one
 * snapshot feeds both the state and the ready set.
 * @param report - status report for one spec
 * @returns the ready set plus the derived state
 */
export const nextOf = (report: StatusReport): NextReport => {
  const derived = report.state?.state ?? 'inconsistent';
  const phase = activePhaseOf(report);
  const base = {
    name: report.name,
    state: derived,
    verify: report.verify,
    sizing: report.sizing,
    phases: report.phases ?? [],
    phaseGates: report.phaseGates ?? new Map(),
  };
  const runs = report.runs;
  if (derived === 'inconsistent' || derived === 'complete' || phase === undefined) {
    const empty: NextReport = {
      ...base,
      phase: undefined,
      budget: undefined,
      ready: [],
    };
    return runs === undefined ? empty : { ...empty, runs };
  }
  const byId = new Map(report.tasks.map((task) => [task.id, task]));
  const gates = report.gatedTaskIds ?? new Set<string>();
  const inPhase = report.tasks.filter((task) => phaseOf(task.id) === phase);
  const ready: Array<ReadyTask> = [];
  for (const task of inPhase) {
    if (task.status !== 'pending') continue;
    const entry: ReadyTask = {
      id: task.id,
      name: task.name,
      type: task.type,
      gates: gates.has(task.id),
      writeScope: writeScopeTokens(task),
      sizing: taskTarget(report.sizing, task),
    };
    if (task.type === 'review') {
      const open = inPhase.some((other) => other.type !== 'review' && other.status !== 'complete');
      if (!open) ready.push(entry);
      continue;
    }
    if (task.dependsOn.every((dep) => byId.get(dep)?.status === 'complete')) ready.push(entry);
  }
  ready.sort((a, b) => sortKey(a.id) - sortKey(b.id));
  const filled: NextReport = {
    ...base,
    phase,
    budget: phaseReviewBudget(inPhase.map(budgetInput)),
    ready,
  };
  return runs === undefined ? filled : { ...filled, runs };
};

/**
 * Compute the ready set for a spec's active phase: pending tasks whose
 * `depends-on` targets are all complete, in id order. A `review` task is
 * ready only once every other task in its phase is complete. An
 * `inconsistent` or `complete` spec has no ready set — the caller repairs or
 * stops rather than guessing.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the ready set plus the derived state
 */
export const next = (
  root: string,
  name: string,
): Effect.Effect<
  NextReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    yield* guardFailure('SpecNext', guardSpecName(name, GUARD_RERUN.next));
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecNext',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation: 'SpecNext', diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const review = yield* store.reviewSeries(root, name);
    const sizing = yield* loadSizing(root, name, snapshot);
    const report = summarize(name, snapshot, review, sizing);
    const runs = yield* runSummary(workspaceOf(root), yield* Clock.currentTimeMillis);
    return { ...nextOf(report), runs };
  });

/**
 * Render the ready set for an orchestrator. A gated task is marked `gated`
 * so the caller runs its `GATES.md` before marking it complete. Each task
 * carries its declared size, resolved target, and winning layer, unless a
 * config or task-size error makes the phase undispatchable — then the targets
 * are omitted rather than guessed.
 * @param report - report from {@link next}
 * @returns the phase header plus one line per ready task
 */
export const renderNext = (report: NextReport): string => {
  const budget = report.budget === undefined ? '' : ` · budget ${report.budget}`;
  const view =
    report.phase === undefined
      ? undefined
      : (report.phases ?? []).find((phase) => phase.phase === report.phase);
  const decision =
    view === undefined || view.review === undefined
      ? ''
      : ` · review ${view.phase}:${view.review} · ${phaseGateText(view)}`;
  const phaseGateTextOf =
    report.phase === undefined
      ? ''
      : ((text) => {
          if (text === undefined) return '';
          const kinds = [
            ...new Set(
              parseGates(text)
                .map((stage) => stage.kind)
                .filter((kind): kind is NonNullable<typeof kind> => kind !== undefined),
            ),
          ].toSorted((left, right) => left.localeCompare(right));
          const kind = kinds.length === 0 ? 'unclassified' : kinds.join('+');
          return ` · phase-gate ${kind} repo · shared once at boundary`;
        })((report.phaseGates ?? new Map()).get(report.phase));
  const head = `state ${report.state}${report.phase === undefined ? '' : ` · phase ${report.phase}`}${budget}${decision}${phaseGateTextOf}`;
  if (report.ready.length === 0) return `${head}\nready none`;
  // The same predicate the command exits on: a tree `check` calls invalid never
  // prints a dispatchable target, whatever kind of error blocks it.
  const blocked = dispatchBlocked(report.sizing, report.verify, report.name);
  return [
    head,
    ...report.ready.map((task) => {
      // A ready task with a missing or unknown size gets no target; its
      // siblings still carry theirs, and the command prints the diagnostic.
      const sized = !blocked && task.sizing.size !== undefined;
      const scope = task.writeScope === undefined ? 'none' : task.writeScope.join(',');
      const gate = task.gates ? ` · gate task-local ${scope}` : '';
      return `${task.id}  ${task.gates ? 'gated  ' : ''}${task.type}  ${task.name}${gate}${sized ? targetColumns(task.sizing) : ''}`;
    }),
  ].join('\n');
};

// ─── Which ────────────────────────────────────────────────────────────

/** Options for {@link which}. */
export const statusCommand = Command.make(
  'status',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* status(storeDirOf(config.dir), config.name);
        yield* Console.log(renderStatus(report));
        const exit = dispatchExitCode(report.sizing, report.verify, report.name);
        const blockers = dispatchErrorText(
          report.sizing,
          report.verify,
          report.name,
          config.verbose,
        );
        if (blockers !== '') yield* Console.log(`\n${blockers}`);
        if (exit !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = exit;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Show the status of one spec (--name required).'),
  Command.provide(SpecStore.Default),
);

export const stateCommand = Command.make(
  'state',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const found = yield* stateWithReport(storeDirOf(config.dir), config.name);
        yield* Console.log(renderState(found.state));
        // Same dispatch truth as `status` / `next` / `check`: a tree the
        // verifier rejects is never reported as a clean state, and `--verbose`
        // expands the codes the compact line names into their full blocks.
        if (found.state.blocked) {
          if (config.verbose) {
            const blockers = dispatchErrorText(
              found.report.sizing,
              found.report.verify,
              found.report.name,
              true,
            );
            if (blockers !== '') yield* Console.log(`\n${blockers}`);
          }
          yield* Effect.sync(() => {
            process.exitCode = VALIDATION_EXIT_CODE;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs state --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Print a spec derived state: status, state, active phase, locks.'),
  Command.provide(SpecStore.Default),
);

export const nextCommand = Command.make(
  'next',
  { dir: dirFlag, name: nameFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* next(storeDirOf(config.dir), config.name);
        yield* Console.log(renderNext(report));
        const blockers = dispatchErrorText(
          report.sizing,
          report.verify,
          report.name,
          config.verbose,
        );
        if (blockers !== '') {
          yield* Console.log(`\n${blockers}`);
        }
        const exit = dispatchExitCode(report.sizing, report.verify, report.name);
        if (exit !== 0) {
          yield* Effect.sync(() => {
            process.exitCode = exit;
          });
        }
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('Print the ready task set for a spec active phase.'),
  Command.provide(SpecStore.Default),
);

/** `resolve` and `sizing` share the required task selector. */
