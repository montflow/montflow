import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';

import { type Spec, parseSpecFile } from '../../modules/spec/index.js';
import {
  type Analysis,
  type State,
  analyze as analyzeLifecycle,
} from '../../modules/lifecycle/index.js';

import { SIZES, phaseReviewBudget, resolve as resolveSizing } from '../../modules/sizing/index.js';
import {
  type ReviewInput,
  type SpecSnapshot,
  verifySpecTree,
} from '../../modules/structure/index.js';
import type { SeriesSnapshot } from '../../modules/review-link/index.js';
import { Task, parseTaskDirName, phaseOf } from '../../modules/task/index.js';
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
}

/** Task ids carrying a `GATES.md`, read from the snapshot. */
export const gatedTaskIds = (snapshot: SpecSnapshot): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const file of snapshot.files) {
    const slash = file.path.indexOf('/');
    if (slash === -1) continue;
    const dir = file.path.slice(0, slash);
    if (file.path !== `${dir}/GATES.md`) continue;
    const parsed = parseTaskDirName(dir);
    if (parsed !== undefined) ids.add(parsed.id);
  }
  return ids;
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
  const ordered = tasksOf(snapshot);
  const reviewInput: ReviewInput = { series: review, requireRounds: false };
  return {
    name,
    spec,
    tasks: ordered,
    state:
      spec === undefined
        ? undefined
        : analyzeLifecycle({
            status: spec.status,
            lockedPhases: spec.lockedPhases,
            tasks: ordered.map((task) => ({ id: task.id, status: task.status })),
          }),
    verify: verifySpecTree(snapshot, reviewInput),
    sizing,
    gatedTaskIds: gatedTaskIds(snapshot),
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
): Effect.Effect<StatusReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
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
    return summarize(name, snapshot, review, sizing);
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
    const locked =
      spec.lockedPhases.length > 0 ? ` \u00b7 locked ${spec.lockedPhases.join(',')}` : '';
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

  const phases = new Map<string, Array<Task>>();
  for (const task of report.tasks) {
    const phase = phaseOf(task.id);
    const bucket = phases.get(phase) ?? [];
    bucket.push(task);
    phases.set(phase, bucket);
  }
  for (const [phase, tasks] of phases) {
    const locked = report.state?.phases.find((summary) => summary.phase === phase)?.locked === true;
    const sizes = phaseSizes(tasks);
    lines.push('');
    lines.push(
      `Phase ${phase}${locked ? ' \u00b7 locked' : ''} \u00b7 budget ${phaseReviewBudget(tasks.map(budgetInput))}${sizes.length === 0 ? '' : ` \u00b7 sizes ${sizes.join(',')}`}`,
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
  readonly lockedPhases: ReadonlyArray<string>;
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
  lockedPhases: report.spec?.lockedPhases ?? [],
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
  SpecStore.SpecStore
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
): Effect.Effect<StateReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  stateWithReport(root, name).pipe(Effect.map((found) => found.state));

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
  const line = `${report.name} · ${report.declared} · state ${report.state} · phase ${phase} · locked ${locked}`;
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
  if (derived === 'inconsistent' || derived === 'complete' || phase === undefined) {
    return {
      name: report.name,
      state: derived,
      phase: undefined,
      budget: undefined,
      ready: [],
      verify: report.verify,
      sizing: report.sizing,
    };
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
      sizing: taskTarget(report.sizing, task),
    };
    if (task.type === 'review') {
      const open = inPhase.some((other) => other.type !== 'review' && other.status !== 'complete');
      if (!open) ready.push(entry);
      continue;
    }
    if (task.dependsOn.every((dep) => byId.get(dep)?.status === 'complete')) ready.push(entry);
  }
  ready.sort((a, b) => a.id.localeCompare(b.id));
  return {
    name: report.name,
    state: derived,
    phase,
    budget: phaseReviewBudget(inPhase.map(budgetInput)),
    ready,
    verify: report.verify,
    sizing: report.sizing,
  };
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
): Effect.Effect<NextReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
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
    return nextOf(report);
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
  const head = `state ${report.state}${report.phase === undefined ? '' : ` · phase ${report.phase}`}${budget}`;
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
      return `${task.id}  ${task.gates ? 'gated  ' : ''}${task.type}  ${task.name}${sized ? targetColumns(task.sizing) : ''}`;
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
