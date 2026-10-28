import { Clock, Effect } from 'effect';
import { type Spec, isValidName, parseSpecFile } from '../../modules/spec/index.js';
import {
  type Analysis,
  type State,
  STATES,
  analyze as analyzeLifecycle,
} from '../../modules/lifecycle/index.js';
import {
  SCAFFOLD_TASK_TYPES,
  isScaffoldTaskType,
  renderSpecScaffold,
} from '../../modules/scaffold/index.js';
import type { ScaffoldTask } from '../../modules/scaffold/index.js';
import { type SpecSnapshot, verifySpecTree } from '../../modules/structure/index.js';
import {
  SLUG_PATTERN,
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
} from '../../modules/task/index.js';
import {
  type Issue,
  type Result,
  errorCount,
  isWarning,
  noErrors,
  promoteWarnings,
  warningCount,
} from '../../modules/verify/index.js';
import { SpecStore } from '../../services/index.js';

/** Spec store directory, relative to the workspace root. */
export const DEFAULT_ROOT = '.agents/@montflow/specs';

/**
 * Resolve the spec store directory from a workspace-root argument. `.` (the
 * default) reads the store directly under the working directory.
 * @param root - workspace root passed via `--dir`
 * @returns the store directory
 */
export const storeDirOf = (root: string): string =>
  root === '.' ? DEFAULT_ROOT : `${root.replace(/\/+$/, '')}/${DEFAULT_ROOT}`;

/** How many specs are verified in parallel by default. */
export const DEFAULT_CONCURRENCY = 8;

/** Comma-separated values; blank or absent reads as an empty list. */
export const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value.trim() === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

// ─── Check ────────────────────────────────────────────────────────────

/** Verification outcome for one spec. */
export interface CheckSpec {
  readonly name: string;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** Whole-run check result. */
export interface CheckReport {
  readonly root: string;
  readonly specs: ReadonlyArray<CheckSpec>;
  /** Specs with at least one error-severity issue (warnings never count here). */
  readonly failed: number;
  /** Total error-severity findings across every spec. */
  readonly issueCount: number;
  /** Total warning-severity findings across every spec, counted apart from issues. */
  readonly warningCount: number;
}

/** Options for {@link check}. */
export interface CheckOptions {
  /** Check only this spec directory instead of the whole root. */
  readonly name?: string;
  /** Specs verified concurrently. */
  readonly concurrency?: number;
  /** Promote warnings to errors, so an advisory finding fails the check. */
  readonly strict?: boolean;
}

/** One spec's findings, before reduction into a report. */
export interface CheckEntry {
  readonly name: string;
  readonly issues: ReadonlyArray<Issue>;
}

/**
 * Reduce per-spec findings into a {@link CheckReport}. `strict` promotes every
 * warning to an error first, so a warning fails the run only under `--strict`.
 * Pure — the caller supplies the findings.
 * @param root - spec root directory
 * @param entries - one entry per spec, in output order
 * @param strict - promote warnings to errors
 * @returns the aggregated report
 */
export const reduceCheck = (
  root: string,
  entries: ReadonlyArray<CheckEntry>,
  strict: boolean,
): CheckReport => {
  const specs = entries.map(({ name, issues }): CheckSpec => {
    const effective = strict ? promoteWarnings(issues) : issues;
    return { name, valid: noErrors(effective), issues: effective };
  });
  return {
    root,
    specs,
    failed: specs.filter((spec) => !spec.valid).length,
    issueCount: specs.reduce((sum, spec) => sum + errorCount(spec.issues), 0),
    warningCount: specs.reduce((sum, spec) => sum + warningCount(spec.issues), 0),
  };
};

/** Process exit code a check report implies: `0` when nothing failed, else `1`. */
export const checkExitCode = (report: CheckReport): number => (report.failed > 0 ? 1 : 0);

/**
 * Mechanically verify every spec under `root` (or one `name`). Each
 * spec is a pure `verifySpecTree` over its snapshot, so the
 * specs run concurrently. Never fails on a bad spec — bad specs
 * become failing entries; only IO failures fail. Warnings are advisory
 * unless `strict` promotes them.
 * @param root - spec root directory
 * @param options - optional single-spec, concurrency, and strictness controls
 * @returns the aggregated report
 */
export const check = (
  root: string,
  options: CheckOptions = {},
): Effect.Effect<CheckReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const strict = options.strict ?? false;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecCheck',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    if (options.name !== undefined && !(yield* store.exists(root, options.name))) {
      const issues: ReadonlyArray<Issue> = [
        { field: options.name, message: `Spec directory not found under ${root}.` },
      ];
      return reduceCheck(root, [{ name: options.name, issues }], strict);
    }
    const names = options.name !== undefined ? [options.name] : yield* store.names(root);
    const entries = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(
          Effect.map((snapshot): CheckEntry => {
            const result = verifySpecTree(snapshot);
            return { name, issues: result.issues };
          }),
        ),
      { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY },
    );
    return reduceCheck(root, entries, strict);
  });

/**
 * The `(…)` count suffix on a check spec line, naming errors and warnings apart.
 */
const checkCounts = (errors: number, warnings: number): string => {
  if (warnings === 0) return errors === 0 ? '' : ` (${errors})`;
  const parts: Array<string> = [];
  if (errors > 0) parts.push(`${errors} issue${errors === 1 ? '' : 's'}`);
  parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return ` (${parts.join(' \u00b7 ')})`;
};

/**
 * Render a check report. Token-lean by default — failures and warnings, plus a
 * one-line summary. `verbose` also lists passing specs and the root. Warnings
 * render with a `!` mark, counted apart from issues, and never fail a spec.
 * @param report - report from {@link check}
 * @param verbose - include passing specs and the root path
 * @returns the display text
 */
export const renderCheck = (report: CheckReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const spec of report.specs) {
    const errors = errorCount(spec.issues);
    const warnings = warningCount(spec.issues);
    if (spec.valid && warnings === 0 && !verbose) continue;
    lines.push(`${spec.valid ? '\u2713' : '\u2717'} ${spec.name}${checkCounts(errors, warnings)}`);
    for (const found of spec.issues) {
      lines.push(`${isWarning(found) ? '  ! ' : '  '}${found.field}: ${found.message}`);
      if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
    }
  }
  if (lines.length > 0) lines.push('');
  const specCount = report.specs.length;
  const warningSuffix =
    report.warningCount === 0
      ? ''
      : ` \u00b7 ${report.warningCount} warning${report.warningCount === 1 ? '' : 's'}`;
  lines.push(
    `${specCount} spec${specCount === 1 ? '' : 's'} \u00b7 ${report.failed} failed \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}${warningSuffix}`,
  );
  return lines.join('\n');
};

// ─── Status ───────────────────────────────────────────────────────────

/** Status report for one spec. */
export interface StatusReport {
  readonly name: string;
  readonly spec: Spec | undefined;
  readonly tasks: ReadonlyArray<Task>;
  /** Derived lifecycle analysis; undefined when SPEC.md does not parse. */
  readonly state: Analysis | undefined;
  readonly verify: Result;
}

/**
 * Reduce one spec snapshot to a {@link StatusReport}. Pure over the
 * snapshot, so both `status` and `list` share the same summarizer.
 * `spec` / `state` are undefined when SPEC.md is missing or unparsable.
 * @param name - spec directory name
 * @param snapshot - every file under the spec root
 * @returns the status report
 */
const summarize = (name: string, snapshot: SpecSnapshot): StatusReport => {
  const specFile = snapshot.files.find((file) => file.path === 'SPEC.md');
  const spec = specFile === undefined ? undefined : parseSpecFile(specFile.content);
  const tasks: Array<Task> = [];
  for (const file of snapshot.files) {
    if (!file.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(file.content);
    if (task !== undefined) tasks.push(task);
  }
  const ordered = tasks.toSorted((a, b) => a.id.localeCompare(b.id));
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
    verify: verifySpecTree(snapshot),
  };
};

/**
 * Read one spec and summarize it. Fails only on IO / missing spec.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the status report
 */
export const status = (
  root: string,
  name: string,
): Effect.Effect<StatusReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
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
        new SpecStore.StoreError({
          operation: 'SpecStatus',
          reason: `Spec '${name}' not found under ${root}.`,
        }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    return summarize(name, snapshot);
  });

/** Per-status display mark, kept terse for token efficiency. */
const STATUS_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
} satisfies Record<string, string>;

const statusCounts = (tasks: ReadonlyArray<Task>): string =>
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
    lines.push(`  ! ${found.field}: ${found.message}`);
    if (found.fix !== undefined) lines.push(`    Fix: ${found.fix}`);
  }
  if (report.state !== undefined && report.state.state === 'inconsistent') {
    for (const found of report.state.issues) lines.push(`  ${found.field}: ${found.message}`);
  }

  const phases = new Map<string, Array<Task>>();
  for (const task of report.tasks) {
    const phase = task.id.replace(/\d+$/, '');
    const bucket = phases.get(phase) ?? [];
    bucket.push(task);
    phases.set(phase, bucket);
  }
  for (const [phase, tasks] of phases) {
    const locked = report.state?.phases.find((summary) => summary.phase === phase)?.locked === true;
    lines.push('');
    lines.push(`Phase ${phase}${locked ? ' \u00b7 locked' : ''}`);
    for (const task of tasks) {
      lines.push(
        `  ${STATUS_MARK[task.status] ?? '?'} ${task.id}  ${task.name.padEnd(24)} ${task.type}`,
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
}

/**
 * Reduce one spec to the derived state an orchestrator acts on: the
 * declared status, the derived lifecycle state, the active phase, and the
 * locked phases. `inconsistent` means the bookkeeping contradicts itself,
 * which the caller repairs before dispatching anything.
 * @param root - spec root directory
 * @param name - spec directory name
 * @returns the compact state report
 */
export const state = (
  root: string,
  name: string,
): Effect.Effect<StateReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const report = yield* status(root, name);
    return {
      name,
      declared: report.spec?.status ?? 'unreadable',
      state: report.state?.state ?? 'inconsistent',
      phase: activePhaseOf(report),
      lockedPhases: report.spec?.lockedPhases ?? [],
    };
  });

/** The active phase from a status report: first unlocked phase with unfinished work. */
const activePhaseOf = (report: StatusReport): string | undefined =>
  report.state?.phases.find((phase) => !phase.locked && phase.complete < phase.total)?.phase;

/**
 * Render the compact state line the orchestrator reads.
 * @param report - report from {@link state}
 * @returns one status line
 */
export const renderState = (report: StateReport): string => {
  const phase = report.phase === undefined ? 'none' : report.phase;
  const locked = report.lockedPhases.length === 0 ? 'none' : report.lockedPhases.join(',');
  return `${report.name} · ${report.declared} · state ${report.state} · phase ${phase} · locked ${locked}`;
};

/** One task the orchestrator may start now. */
export interface ReadyTask {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** True when the task carries a per-task `GATES.md` that must pass first. */
  readonly gates: boolean;
}

/** The ready set for the active phase, plus the state it was derived from. */
export interface NextReport {
  readonly name: string;
  readonly state: State;
  readonly phase: string | undefined;
  /** Tasks ready to start: pending, dependencies complete, review last. */
  readonly ready: ReadonlyArray<ReadyTask>;
}

/** Task ids carrying a `GATES.md`, read from the snapshot. */
const gatedTaskIds = (snapshot: SpecSnapshot): ReadonlySet<string> => {
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
): Effect.Effect<NextReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
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
        new SpecStore.StoreError({
          operation: 'SpecNext',
          reason: `Spec '${name}' not found under ${root}.`,
        }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const report = summarize(name, snapshot);
    const derived = report.state?.state ?? 'inconsistent';
    const phase = activePhaseOf(report);
    if (derived === 'inconsistent' || derived === 'complete' || phase === undefined) {
      return { name, state: derived, phase: undefined, ready: [] };
    }
    const byId = new Map(report.tasks.map((task) => [task.id, task]));
    const gates = gatedTaskIds(snapshot);
    const inPhase = report.tasks.filter((task) => phaseOf(task.id) === phase);
    const ready: Array<ReadyTask> = [];
    for (const task of inPhase) {
      if (task.status !== 'pending') continue;
      const entry: ReadyTask = {
        id: task.id,
        name: task.name,
        type: task.type,
        gates: gates.has(task.id),
      };
      if (task.type === 'review') {
        const open = inPhase.some(
          (other) => other.type !== 'review' && other.status !== 'complete',
        );
        if (!open) ready.push(entry);
        continue;
      }
      if (task.dependsOn.every((dep) => byId.get(dep)?.status === 'complete')) ready.push(entry);
    }
    ready.sort((a, b) => a.id.localeCompare(b.id));
    return { name, state: derived, phase, ready };
  });

/**
 * Render the ready set for an orchestrator. A gated task is marked `gated`
 * so the caller runs its `GATES.md` before marking it complete.
 * @param report - report from {@link next}
 * @returns the phase header plus one line per ready task
 */
export const renderNext = (report: NextReport): string => {
  const head = `state ${report.state}${report.phase === undefined ? '' : ` · phase ${report.phase}`}`;
  if (report.ready.length === 0) return `${head}\nready none`;
  return [
    head,
    ...report.ready.map(
      (task) => `${task.id}  ${task.gates ? 'gated  ' : ''}${task.type}  ${task.name}`,
    ),
  ].join('\n');
};

// ─── List ─────────────────────────────────────────────────────────────

/** Derived spec states accepted by `--status`, with `completed` as an alias. */
export const LIST_STATUSES: ReadonlyArray<State> = STATES;

const isSpecState = (value: string): value is State =>
  LIST_STATUSES.some((candidate) => candidate === value);

/** Options for {@link list}. */
export interface ListOptions {
  /** Derived lifecycle states to keep; empty keeps every state. */
  readonly statuses?: ReadonlyArray<State> | undefined;
  /** Keep only unfinished specs (`state !== 'complete'`). */
  readonly pending?: boolean | undefined;
}

/** Listing result over a spec root. */
export interface ListReport {
  readonly root: string;
  /** Matched specs, in directory order. */
  readonly specs: ReadonlyArray<StatusReport>;
  /** Every spec under the root, before filtering. */
  readonly total: number;
  /** Specs that matched the filter. */
  readonly matched: number;
}

const matchesList = (report: StatusReport, options: ListOptions): boolean => {
  const derived = report.state?.state;
  if (options.pending === true && derived === 'complete') return false;
  const statuses = options.statuses;
  if (statuses !== undefined && statuses.length > 0) {
    if (derived === undefined || !statuses.includes(derived)) return false;
  }
  return true;
};

/**
 * List every spec under `root`, reduced to its derived lifecycle state
 * and task counts, optionally filtered by state. Reads each spec once
 * and reuses the {@link status} summarizer. Fails only on IO.
 * @param root - spec root directory
 * @param options - optional state filters
 * @returns the matched specs plus total/matched counts
 */
export const list = (
  root: string,
  options: ListOptions = {},
): Effect.Effect<ListReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecList',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const names = yield* store.names(root);
    const reports = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(Effect.map((snapshot) => summarize(name, snapshot))),
      { concurrency: DEFAULT_CONCURRENCY },
    );
    const specs = reports.filter((report) => matchesList(report, options));
    return { root, specs, total: reports.length, matched: specs.length };
  });

/** Listing state mark, aligned with {@link STATUS_MARK}. */
const LIST_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
  inconsistent: '\u2717',
} satisfies Record<State, string>;

/**
 * Render a listing report: one line per matched spec, then a
 * matched-of-total summary. Token-lean; `verbose` prepends the root.
 * @param report - report from {@link list}
 * @param verbose - include the root path
 * @returns the display text
 */
export const renderList = (report: ListReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const spec of report.specs) {
    const derived = spec.state?.state;
    const mark = derived === undefined ? '\u2717' : LIST_MARK[derived];
    const declared = spec.spec?.status ?? 'unreadable';
    const counts = statusCounts(spec.tasks) || `${spec.tasks.length} tasks`;
    const errors = errorCount(spec.verify.issues);
    const warnings = warningCount(spec.verify.issues);
    const parts: Array<string> = [];
    if (errors > 0) parts.push(`\u2717 ${errors}`);
    if (warnings > 0) parts.push(`! ${warnings} warning${warnings === 1 ? '' : 's'}`);
    const verdict = parts.length === 0 ? '' : ` \u00b7 ${parts.join(' \u00b7 ')}`;
    lines.push(
      `${mark} ${spec.name}  ${declared} \u00b7 ${derived ?? 'unreadable'} \u00b7 ${counts}${verdict}`,
    );
  }
  if (lines.length > 0) lines.push('');
  lines.push(
    `${report.total} spec${report.total === 1 ? '' : 's'} \u00b7 ${report.matched} matched`,
  );
  return lines.join('\n');
};

/** Parsed listing filter: options, or a user-facing error. */
export type ListFilter = { readonly options: ListOptions } | { readonly error: string };

/**
 * Turn raw `--status`/`--pending` inputs into {@link ListOptions}.
 * `--pending` is shorthand for every unfinished state and cannot combine
 * with `--status`; `completed` is accepted as an alias for `complete`.
 * @param rawStatuses - comma-separated `--status` value, if given
 * @param pending - whether `--pending` was set
 * @returns the options or an error message
 */
export const resolveListOptions = (
  rawStatuses: string | undefined,
  pending: boolean,
): ListFilter => {
  const trimmed = rawStatuses?.trim() ?? '';
  if (pending && trimmed !== '') {
    return { error: 'Use --pending or --status, not both.' };
  }
  if (pending) return { options: { pending: true } };
  if (trimmed === '') return { options: {} };
  const states: Array<State> = [];
  for (const token of trimmed
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')) {
    const canonical = token === 'completed' ? 'complete' : token;
    if (!isSpecState(canonical)) {
      return {
        error: `Unknown status '${token}'. Use one of: ${LIST_STATUSES.join(', ')}.`,
      };
    }
    states.push(canonical);
  }
  return { options: { statuses: states } };
};

// ─── Create ───────────────────────────────────────────────────────────

/** Default task name when no `--tasks` value is supplied. */
export const DEFAULT_SCAFFOLD_TASK = 'implement';

/** Options for {@link scaffold}. */
export interface ScaffoldOptions {
  /** Spec slug; also the directory name. */
  readonly name: string;
  /** Author stamped into `SPEC.md`; defaults to `spec-scaffold`. */
  readonly author?: string | undefined;
  readonly description?: string | undefined;
  /** `in-place` (default) or `worktree`. */
  readonly workspaceType?: string | undefined;
  /** Raw tasks, each `name[:type[:gates]]`; defaults to one `implement` task. */
  readonly taskSpecs?: ReadonlyArray<string> | undefined;
  /** Ordered reviewer profile slugs emitted on the phase's review task. */
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
}

/** What {@link scaffold} wrote. */
export interface ScaffoldReport {
  readonly name: string;
  /** Spec directory, POSIX-joined from the store root. */
  readonly dir: string;
  readonly phase: string;
  readonly taskCount: number;
  /** Spec-relative file paths written, in write order. */
  readonly files: ReadonlyArray<string>;
}

/** Parsed task spec: the task, or a user-facing error. */
export type ScaffoldTaskParse =
  | { readonly ok: true; readonly task: ScaffoldTask }
  | { readonly ok: false; readonly error: string };

/**
 * Parse one `name[:type[:gates]]` task spec. The type defaults to
 * `execution`; the gates token is `gates` or `true` to request a `GATES.md`.
 * @param raw - one raw task spec
 * @returns the task, or a user-facing error
 */
export const parseScaffoldTask = (raw: string): ScaffoldTaskParse => {
  const [name = '', type = 'execution', gates = ''] = raw.split(':');
  if (!isValidName(name)) {
    return {
      ok: false,
      error: `'${name}' is not a valid task name — use a kebab-case slug such as 'build-login'.`,
    };
  }
  if (!isScaffoldTaskType(type)) {
    return {
      ok: false,
      error: `Unknown task type '${type}' — use one of: ${SCAFFOLD_TASK_TYPES.join(', ')}.`,
    };
  }
  return {
    ok: true,
    task: { name, type, gates: gates === 'gates' || gates === 'true' },
  };
};

/**
 * Scaffold a mechanically valid spec tree under `root/<name>`: `SPEC.md`,
 * one task directory per task, and the phase's review task. Deterministic
 * and model-free — the mechanical half of `mf-specs create`. Refuses to
 * touch an existing spec directory.
 * @param root - spec root directory
 * @param options - spec name, metadata, and task specs
 * @returns what was written, failing with a displayable reason
 */
export const scaffold = (
  root: string,
  options: ScaffoldOptions,
): Effect.Effect<ScaffoldReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecCreate';
    const refuse = (reason: string) => Effect.fail(new SpecStore.StoreError({ operation, reason }));
    if (!isValidName(options.name)) {
      return yield* refuse(
        `'${options.name}' is not a valid spec name — use a kebab-case slug such as 'ship-login'.`,
      );
    }
    const workspaceType = options.workspaceType ?? 'in-place';
    if (workspaceType !== 'in-place' && workspaceType !== 'worktree') {
      return yield* refuse(
        `Unknown workspace type '${workspaceType}' — use 'in-place' or 'worktree'.`,
      );
    }
    const store = yield* SpecStore.SpecStore;
    if (yield* store.exists(root, options.name)) {
      return yield* refuse(`Spec '${options.name}' already exists under ${root}.`);
    }
    const seenProfiles = new Set<string>();
    for (const profile of options.reviewerProfiles ?? []) {
      if (!SLUG_PATTERN.test(profile)) {
        return yield* refuse(
          `'${profile}' is not a valid reviewer profile — use a kebab-case slug such as 'effect-reviewer'.`,
        );
      }
      if (seenProfiles.has(profile)) {
        return yield* refuse(`Reviewer profile '${profile}' is listed more than once.`);
      }
      seenProfiles.add(profile);
    }
    const rawTasks =
      options.taskSpecs === undefined || options.taskSpecs.length === 0
        ? [DEFAULT_SCAFFOLD_TASK]
        : options.taskSpecs;
    const tasks: Array<ScaffoldTask> = [];
    for (const raw of rawTasks) {
      const parsed = parseScaffoldTask(raw);
      if (!parsed.ok) return yield* refuse(parsed.error);
      tasks.push(parsed.task);
    }
    const now = yield* Clock.currentTimeMillis;
    const created = new Date(now).toISOString().slice(0, 10);
    const rendered = renderSpecScaffold({
      name: options.name,
      author: options.author?.trim() || 'spec-scaffold',
      created,
      description: options.description,
      workspaceType,
      reviewerProfiles: options.reviewerProfiles,
      tasks,
    });
    yield* store.write(root, options.name, rendered.files);
    return {
      name: options.name,
      dir: `${root.replace(/\/+$/, '')}/${options.name}`,
      phase: rendered.phase,
      taskCount: rendered.taskCount,
      files: rendered.files.map((file) => file.path),
    };
  });

/**
 * Render a scaffold report: one header line, the directory, and the files.
 * @param report - report from {@link scaffold}
 * @returns the display text
 */
export const renderScaffold = (report: ScaffoldReport): string =>
  [
    `\u2713 created '${report.name}' \u00b7 phase ${report.phase} \u00b7 ${report.taskCount} task${report.taskCount === 1 ? '' : 's'}`,
    report.dir,
    ...report.files.map((file) => `  ${file}`),
  ].join('\n');

// ─── Slash-command form ───────────────────────────────────────────────

/** Result of the slash-command form: rendered output plus a success flag. */
export interface SlashReport {
  readonly output: string;
  readonly ok: boolean;
}

/** Parsed slash args: `check`/`status`/`state`/`next`/`list`/`create` plus their flags. */
interface SlashArgs {
  readonly command: 'check' | 'status' | 'state' | 'next' | 'list' | 'create';
  readonly name: string | undefined;
  readonly dir: string | undefined;
  readonly verbose: boolean;
  readonly strict: boolean;
  readonly statusFilter: string | undefined;
  readonly pending: boolean;
  readonly description: string | undefined;
  readonly author: string | undefined;
  readonly workspaceType: string | undefined;
  readonly tasks: ReadonlyArray<string>;
  readonly reviewerProfiles: ReadonlyArray<string>;
}

/** Flags the slash parser accepts as `--key value` or `--key=value`. */
const SLASH_VALUE_FLAGS = new Set([
  'name',
  'dir',
  'status',
  'description',
  'author',
  'workspace-type',
  'tasks',
  'reviewer-profiles',
]);

const parseSlashArgs = (args: string): SlashArgs => {
  const tokens = args.split(/\s+/).filter((token) => token !== '');
  const head = tokens[0];
  const command: SlashArgs['command'] =
    head === 'status'
      ? 'status'
      : head === 'state'
        ? 'state'
        : head === 'next'
          ? 'next'
          : head === 'list'
            ? 'list'
            : head === 'create'
              ? 'create'
              : 'check';
  const known =
    head === 'check' ||
    head === 'status' ||
    head === 'state' ||
    head === 'next' ||
    head === 'list' ||
    head === 'create';
  const rest = known ? tokens.slice(1) : tokens;
  let name: string | undefined;
  let dir: string | undefined;
  let statusFilter: string | undefined;
  let description: string | undefined;
  let author: string | undefined;
  let workspaceType: string | undefined;
  let tasks: ReadonlyArray<string> = [];
  let reviewerProfiles: ReadonlyArray<string> = [];
  let verbose = false;
  let pending = false;
  let strict = false;
  const assign = (key: string, value: string): void => {
    if (key === 'name') name = value;
    else if (key === 'dir') dir = value;
    else if (key === 'status') statusFilter = value;
    else if (key === 'description') description = value;
    else if (key === 'author') author = value;
    else if (key === 'workspace-type') workspaceType = value;
    else if (key === 'tasks') tasks = csv(value);
    else if (key === 'reviewer-profiles') reviewerProfiles = csv(value);
  };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] ?? '';
    if (token === '--verbose' || token === '-v') {
      verbose = true;
      continue;
    }
    if (token === '--pending') {
      pending = true;
      continue;
    }
    if (token === '--strict') {
      strict = true;
      continue;
    }
    const inline = /^--([\w-]+)=(.*)$/.exec(token);
    if (inline !== null) {
      if (SLASH_VALUE_FLAGS.has(inline[1] ?? '')) assign(inline[1] ?? '', inline[2] ?? '');
      continue;
    }
    if (token.startsWith('--') && SLASH_VALUE_FLAGS.has(token.slice(2))) {
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        assign(token.slice(2), value);
        index++;
      }
    }
  }
  return {
    command,
    name,
    dir,
    verbose,
    strict,
    statusFilter,
    pending,
    description,
    author,
    workspaceType,
    tasks,
    reviewerProfiles,
  };
};

/**
 * Resolve a `--dir` value against the caller's workspace. The CLI runs from the
 * workspace, so it passes nothing; the server plugin supplies one that joins
 * relative values onto the plugin directory and leaves absolute ones alone.
 */
export type ResolveSlashDir = (dir: string) => string;

/**
 * Run the slash-command form registered as the OpenCode `/mf-specs` command
 * (`src/server.ts`, through `ports.command.register`). Never renders through
 * the CLI; returns the report so the server can post `report.output` into the
 * invoking session, or its failure text when the run fails.
 * @param args - raw slash-command args
 * @param root - default spec root, already resolved against the plugin directory
 * @param resolveDir - resolver for a `--dir` value (identity by default)
 * @returns rendered output plus success flag
 */
export const runSlash = (
  args: string,
  root: string,
  resolveDir: ResolveSlashDir = (dir) => dir,
): Effect.Effect<SlashReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const parsed = parseSlashArgs(args);
    const dir = parsed.dir === undefined ? root : storeDirOf(resolveDir(parsed.dir));
    if (parsed.command === 'create') {
      if (parsed.name === undefined || parsed.name === '') {
        return yield* Effect.fail(
          new SpecStore.StoreError({
            operation: 'SpecCreate',
            reason: 'create requires --name <spec>.',
          }),
        );
      }
      const report = yield* scaffold(dir, {
        name: parsed.name,
        author: parsed.author,
        description: parsed.description,
        workspaceType: parsed.workspaceType,
        taskSpecs: parsed.tasks,
        reviewerProfiles: parsed.reviewerProfiles,
      });
      return { output: renderScaffold(report), ok: true };
    }
    if (parsed.command === 'status') {
      if (parsed.name === undefined || parsed.name === '') {
        return yield* Effect.fail(
          new SpecStore.StoreError({
            operation: 'SpecStatus',
            reason: 'status requires --name <spec>.',
          }),
        );
      }
      const report = yield* status(dir, parsed.name);
      return { output: renderStatus(report), ok: report.verify.valid };
    }
    if (parsed.command === 'state') {
      if (parsed.name === undefined || parsed.name === '') {
        return yield* Effect.fail(
          new SpecStore.StoreError({
            operation: 'SpecState',
            reason: 'state requires --name <spec>.',
          }),
        );
      }
      const report = yield* state(dir, parsed.name);
      return { output: renderState(report), ok: report.state !== 'inconsistent' };
    }
    if (parsed.command === 'next') {
      if (parsed.name === undefined || parsed.name === '') {
        return yield* Effect.fail(
          new SpecStore.StoreError({
            operation: 'SpecNext',
            reason: 'next requires --name <spec>.',
          }),
        );
      }
      const report = yield* next(dir, parsed.name);
      return { output: renderNext(report), ok: report.state !== 'inconsistent' };
    }
    if (parsed.command === 'list') {
      const filter = resolveListOptions(parsed.statusFilter, parsed.pending);
      if ('error' in filter) {
        return yield* Effect.fail(
          new SpecStore.StoreError({ operation: 'SpecList', reason: filter.error }),
        );
      }
      const report = yield* list(dir, filter.options);
      return { output: renderList(report, parsed.verbose), ok: true };
    }
    const options: CheckOptions =
      parsed.name === undefined
        ? { concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict }
        : { name: parsed.name, concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict };
    const report = yield* check(dir, options);
    return { output: renderCheck(report, parsed.verbose), ok: report.failed === 0 };
  });
