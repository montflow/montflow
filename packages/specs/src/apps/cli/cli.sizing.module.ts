import { Console, Effect, FileSystem, Match } from 'effect';
import { Command, Flag } from 'effect/cli';

import {
  CONFIG_FILE,
  type ConfigSet,
  INHERIT,
  LAYERS,
  type Layer,
  SIZES,
  type Size,
  type SizeMap,
  phaseReviewBudget,
  reviewCycles,
  targetOf,
  taskContribution,
  resolve as resolveSizing,
} from '../../modules/sizing/index.js';
import { type SpecSnapshot } from '../../modules/structure/index.js';

import {
  Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  sizeOf,
  verifyTaskSize,
} from '../../modules/task/index.js';
import { type Issue, type Result, isError } from '../../modules/verify/index.js';
import { renderDiagnostics } from '../../modules/diagnostic/index.js';
import {
  SPEC_FILE,
  type BranchSource,
  type WhichMatch,
  type WhichMiss,
  parseGitFile,
  parseHead,
  resolve as resolveWhich,
} from '../../modules/which/index.js';
import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  VALIDATION_EXIT_CODE,
  SURFACE_CODES,
  type SizingDiagnostic,
  diagnostic,
  SurfaceError,
  NESTED_FIELD_SEPARATOR,
  diagnosticOfIssue,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  type SizingLoad,
  loadSizing,
  runDiagnosed,
  verboseFlag,
  dirFlag,
  nameFlag,
} from './cli.shared.module.js';
import { isSizingCode } from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

export interface TaskTarget {
  readonly size: Size | undefined;
  /** `provider/model#effort`, or `inherit`. */
  readonly target: string;
  /** Winning layer; absent when the target is `inherit`. */
  readonly source?: Layer;
}

/** The config layers that apply to a task in `phase`. */
export const configSet = (load: SizingLoad, phase: string): ConfigSet => ({
  repo: load.repo,
  spec: load.spec,
  phase,
});

/**
 * Resolve one task's target from its declared size and its phase's overrides.
 * A task with no declared size, or with one the contract does not know,
 * inherits; the dispatch surfaces fail before printing a target in that case.
 * @param load - the loaded config layers
 * @param task - parsed task
 * @returns the size, target, and winning layer
 */
export const taskTarget = (load: SizingLoad, task: Task): TaskTarget => {
  const size = sizeOf(task);
  if (size === undefined) return { size: undefined, target: INHERIT };
  const resolved = resolveSizing(configSet(load, phaseOf(task.id)), size);
  const base = { size, target: resolved.target };
  return resolved.source === undefined ? base : { ...base, source: resolved.source };
};

/** Render the size, target, and source columns of a task line. */
export const targetColumns = (target: TaskTarget | undefined): string => {
  if (target === undefined) return '';
  const source = target.source === undefined ? '' : `  ${target.source}`;
  return `  ${target.size ?? '-'}  ${target.target}${source}`;
};

/** The distinct sizes of a phase's own tasks, in canonical order. */
export const phaseSizes = (tasks: ReadonlyArray<Task>): ReadonlyArray<Size> =>
  SIZES.filter((size) => tasks.some((task) => task.type !== 'review' && task.size === size));

/**
 * True for a tree finding the loaded spec config already reports. The tree
 * verifier re-reads the spec's `sizing.json` under the bare file name, so its
 * field is normalised to the loader's `<name>/sizing.json` form and compared as
 * a whole `(code, field)` pair. Nothing is dropped on a prefix alone: a tree
 * finding the loader did not report stays a blocker, so a config check only one
 * source runs can never be suppressed.
 */
export const repeatedConfigFinding = (name: string, load: SizingLoad, found: Issue): boolean => {
  if (!isSizingCode(found.code)) return false;
  const field = found.field.startsWith(`${CONFIG_FILE}${NESTED_FIELD_SEPARATOR}`)
    ? `${name}/${found.field}`
    : found.field;
  return load.issues.some((issue) => issue.code === found.code && issue.field === field);
};

/**
 * Every error a dispatch surface must not paper over: config findings plus
 * every other error in the verified tree. `next` / `status` print these as
 * blockers, gate their exit code on them, and withhold their target columns, so
 * both agree with `check` about a tree that cannot be dispatched — never only on
 * config and task-size errors. Warnings stay advisory, including the ones
 * `check --strict` promotes: that flag is a gate decision, not dispatch truth.
 */
export const dispatchErrors = (
  load: SizingLoad,
  verify: Result,
  name: string,
): ReadonlyArray<Issue> => [
  ...load.issues.filter(isError),
  ...verify.issues.filter((found) => isError(found) && !repeatedConfigFinding(name, load, found)),
];

/** True when any error blocks dispatch, so no surface prints a target for it. */
export const dispatchBlocked = (load: SizingLoad, verify: Result, name: string): boolean =>
  dispatchErrors(load, verify, name).length > 0;

/**
 * The dispatch-blocking errors as agent-first diagnostics. `execute` refuses
 * with this list and `status` / `next` print it, so the de-dupe and the paths
 * are one implementation.
 */
export const dispatchDiagnostics = (
  load: SizingLoad,
  verify: Result,
  name: string,
): ReadonlyArray<SizingDiagnostic> => {
  const rerun = `mf-specs check --name ${name}`;
  return dispatchErrors(load, verify, name).map((found) =>
    diagnosticOfIssue(isSizingCode(found.code) ? '' : name, found, rerun),
  );
};

/**
 * Render the dispatch-blocking errors for a `status` / `next` blocker block.
 * @param load - the loaded config layers
 * @param verify - the verified tree
 * @param name - spec directory name
 * @param verbose - add each finding's cause chain and layer trace
 * @returns the rendered blocks, or `''` when nothing blocks dispatch
 */
export const dispatchErrorText = (
  load: SizingLoad,
  verify: Result,
  name: string,
  verbose = false,
): string => renderDiagnostics(dispatchDiagnostics(load, verify, name), verbose);

/**
 * Exit code a `status` / `next` report implies: `1` when any error blocks
 * dispatch — config, task size, or tree structure — else `0`. Both surfaces
 * share it so they agree with each other and with `check` about the same tree.
 */
export const dispatchExitCode = (load: SizingLoad, verify: Result, name: string): number =>
  dispatchBlocked(load, verify, name) ? VALIDATION_EXIT_CODE : 0;

/** Diagnostic for a spec that does not exist. */
export const unknownSpecDiagnostic = (name: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unknownSpec,
    path: name,
    field: 'name',
    problem: `Spec '${name}' not found.`,
    rerun: 'mf-specs list',
    fix: 'Pass a spec directory name that exists under the specs root.',
  });

/** Diagnostic for a task id that a spec does not hold. */
export const unknownTaskDiagnostic = (name: string, taskId: string): SizingDiagnostic =>
  diagnostic({
    code: SURFACE_CODES.unknownTask,
    path: `${name}/${taskId}`,
    field: 'id',
    problem: `Task '${taskId}' not found in spec '${name}'.`,
    rerun: `mf-specs status --name ${name}`,
    fix: `Pass a task id listed under Phase in \`mf-specs status --name ${name}\`.`,
  });

/**
 * Review cycles one task contributes to its phase. Delegates to the sizing
 * module's per-input rule, so the printed contribution and the phase budget are
 * derived from one implementation.
 */
export const contribution = (task: Task): number => taskContribution(budgetInput(task));

/** Review-budget input for a task: its type plus the size a resolver can act on. */
export const budgetInput = (task: Task) => ({ type: task.type, size: sizeOf(task) });

/** One task's sizing picture: target, provenance, and review budgets. */
export interface SizingReport {
  readonly name: string;
  readonly task: Task;
  readonly phase: string;
  readonly target: TaskTarget;
  /** Review cycles the task's own size buys. */
  readonly budget: number;
  /** Review budget of the task's whole phase. */
  readonly phaseBudget: number;
  readonly load: SizingLoad;
}

/** Parse every task under a spec snapshot, in id order. */
export const tasksOf = (snapshot: SpecSnapshot): ReadonlyArray<Task> => {
  const tasks: Array<Task> = [];
  for (const file of snapshot.files) {
    if (!file.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(file.content);
    if (task !== undefined) tasks.push(task);
  }
  return tasks.toSorted((a, b) => a.id.localeCompare(b.id));
};

/** The task directory a snapshot holds for `id`, when one parses. */
export const taskDirOf = (snapshot: SpecSnapshot, id: string): string | undefined => {
  for (const file of snapshot.files) {
    if (!file.path.endsWith('/TASK.md')) continue;
    const dir = file.path.slice(0, file.path.indexOf('/'));
    if (parseTaskDirName(dir)?.id === id) return dir;
  }
  return undefined;
};

/** The `TASK.md` path a spec's task lives at, for a diagnostic's `path` row. */
export const taskFileOf = (name: string, dir: string | undefined): string =>
  dir === undefined ? name : `${name}/${dir}/TASK.md`;

/** Error findings the size rule reports for one parsed task. */
export const taskSizeErrors = (task: Task): ReadonlyArray<Issue> =>
  verifyTaskSize(task.size, task.status).filter(isError);

/**
 * Inspect one task's sizing: its declared size, resolved target, winning
 * layer, and review budgets. Fails with diagnostics for an unknown spec, an
 * unknown task, an invalid config, or a task whose own size is missing or
 * unknown — the same rule `check` applies, so `resolve`/`sizing` can never
 * hand an orchestrator a target for an undispatchable task.
 * @param root - spec root directory
 * @param name - spec directory name
 * @param taskId - task id to inspect
 * @param guardRerun - the command that re-runs the calling surface after a
 *   repaired name; `sizing` and `resolve` share this reader, so each names itself
 * @returns the sizing picture
 */
export const sizingOf = (
  root: string,
  name: string,
  taskId: string,
  guardRerun: string = GUARD_RERUN.sizing,
): Effect.Effect<SizingReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecSizing';
    yield* guardFailure(operation, guardSpecName(name, guardRerun));
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({ operation, reason: `Specs directory not found: ${root}` }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation, diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const load = yield* loadSizing(root, name, snapshot);
    const tasks = tasksOf(snapshot);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) {
      return yield* Effect.fail(
        new SurfaceError({ operation, diagnostics: [unknownTaskDiagnostic(name, taskId)] }),
      );
    }
    const rerun = `mf-specs check --name ${name}`;
    const errors = load.issues.filter(isError);
    if (errors.length > 0) {
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: errors.map((found) => diagnosticOfIssue('', found, rerun)),
        }),
      );
    }
    const sizeErrors = taskSizeErrors(task);
    if (sizeErrors.length > 0) {
      const base = taskFileOf(name, taskDirOf(snapshot, task.id));
      return yield* Effect.fail(
        new SurfaceError({
          operation,
          diagnostics: sizeErrors.map((found) => diagnosticOfIssue(base, found, rerun)),
        }),
      );
    }
    const phase = phaseOf(task.id);
    const size = sizeOf(task);
    return {
      name,
      task,
      phase,
      target: taskTarget(load, task),
      budget: size === undefined ? 0 : reviewCycles(size),
      phaseBudget: phaseReviewBudget(
        tasks.filter((candidate) => phaseOf(candidate.id) === phase).map(budgetInput),
      ),
      load,
    };
  });

/**
 * Render the compact `sizing` line: task id, declared size, target, and the
 * winning layer when the target is not `inherit`.
 * @param report - report from {@link sizingOf}
 * @returns one line
 */
export const renderSizing = (report: SizingReport): string => {
  const source = report.target.source === undefined ? '' : `  ${report.target.source}`;
  return `${report.task.id}  ${report.target.size ?? '-'}  ${report.target.target}${source}`;
};

/** One size's target in one layer, or a marker for an absent layer or size. */
export const layerEntryCell = (
  config: { readonly sizes: SizeMap } | undefined,
  size: Size,
): string => {
  if (config === undefined) return 'absent';
  const entry = config.sizes[size];
  return entry === undefined ? '-' : targetOf(entry);
};

/** One cell of the provenance matrix. */
export const layerCell = (load: SizingLoad, size: Size, layer: Layer, phase: string): string =>
  Match.value(layer).pipe(
    Match.when('repo', () => layerEntryCell(load.repo, size)),
    Match.when('spec', () => layerEntryCell(load.spec, size)),
    Match.when('phase', () => layerEntryCell(load.spec?.phases?.[phase], size)),
    Match.exhaustive,
  );

/**
 * Render the detailed `sizing` report: the declared size, selected target and
 * layer, the review budgets, then a size-by-layer provenance matrix covering
 * all four sizes and every config layer.
 *
 * The budget line names all three numbers, because the task's own budget and its
 * contribution are not the same question: a `review` task buys cycles with its
 * size but contributes none to its phase, and a task that contributes 3 cycles
 * still sits in a phase whose budget is the cap. `size budget` is the task's own
 * size budget; `contributes` is what it adds to the phase; `phase budget` is the
 * effective budget of the phase it belongs to.
 * @param report - report from {@link sizingOf}
 * @returns the multi-line report
 */
export const renderSizingReport = (report: SizingReport): string => {
  const { target, task } = report;
  const source = target.source === undefined ? '' : ` · source ${target.source}`;
  const head = `${task.id} · declared ${target.size ?? 'none'} · target ${target.target}${source}`;
  const budget = `size budget ${report.budget} · contributes ${contribution(task)} · phase ${report.phase} · phase budget ${report.phaseBudget}`;
  const header: ReadonlyArray<string> = ['size', ...LAYERS, 'winner'];
  const rows: ReadonlyArray<ReadonlyArray<string>> = SIZES.map((size) => [
    size,
    layerCell(report.load, size, 'repo', report.phase),
    layerCell(report.load, size, 'spec', report.phase),
    layerCell(report.load, size, 'phase', report.phase),
    resolveSizing(configSet(report.load, report.phase), size).source ?? INHERIT,
  ]);
  const widths = header.map((label, index) =>
    Math.max(label.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: ReadonlyArray<string>): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [head, budget, '', line(header), ...rows.map(line)].join('\n');
};

/** Render `sizing`, selecting the detailed report for `--verbose` / `--human`. */
export const renderSizingMode = (report: SizingReport, detailed: boolean): string =>
  detailed ? renderSizingReport(report) : renderSizing(report);

/** Which file paths a load found, marking an absent layer explicitly. */
export const configFilesLine = (load: SizingLoad): string => {
  if (load.files.length === 0) return 'sizing none';
  const repo = load.files.find((file) => file === CONFIG_FILE) ?? 'none';
  const spec = load.files.find((file) => file !== CONFIG_FILE) ?? 'none';
  return `sizing repo ${repo} · spec ${spec}`;
};

// ─── Check ────────────────────────────────────────────────────────────

/** Verification outcome for one spec. */

export interface WhichOptions {
  /** Branch to resolve instead of reading `.git`/`HEAD` (tests and CI). */
  readonly branch?: string | undefined;
  /** Workspace root that holds `.git`; defaults to the working directory. */
  readonly workspace?: string | undefined;
}

/** Drop trailing slashes so store paths join predictably. */
export const trimTrailingSlash = (value: string): string =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** Read a file, reporting an unreadable or absent one as `undefined`. */
export const readFileOrNone = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(target).pipe(
    Effect.matchEffect({
      onFailure: () => Effect.succeed(undefined),
      onSuccess: (text) => Effect.succeed(text),
    }),
  );

/** Read `<gitdir>/HEAD`, or report why no branch could be read. */
export const readHead = (fs: FileSystem.FileSystem, gitDir: string): Effect.Effect<BranchSource> =>
  Effect.gen(function* () {
    const target = `${trimTrailingSlash(gitDir)}/HEAD`;
    const text = yield* readFileOrNone(fs, target);
    if (text === undefined) {
      return { kind: 'none', reason: 'unreadable-head', detail: `Cannot read '${target}'.` };
    }
    return parseHead(text);
  });

/** Read a `.git` file that names a worktree's git directory, then its `HEAD`. */
export const readWorktreeHead = (
  fs: FileSystem.FileSystem,
  git: string,
  workspace: string,
): Effect.Effect<BranchSource> =>
  Effect.gen(function* () {
    const text = yield* readFileOrNone(fs, git);
    if (text === undefined) {
      return { kind: 'none', reason: 'unreadable-head', detail: `Cannot read '${git}'.` };
    }
    const gitDir = parseGitFile(text, workspace);
    if (gitDir === undefined) {
      return {
        kind: 'none',
        reason: 'unreadable-head',
        detail: `'${git}' has no 'gitdir:' line.`,
      };
    }
    return yield* readHead(fs, gitDir);
  });

/**
 * Detect the checked-out branch without assuming a checkout form: `.git` may
 * be a directory or a file naming a worktree's git directory, and that
 * directory is what holds `HEAD`. A missing `.git` and an unreadable `HEAD`
 * resolve to no branch instead of failing the command.
 * @param workspace - workspace root to inspect
 * @returns the branch, or why there is none
 */
export const detectBranch = (
  workspace: string,
): Effect.Effect<BranchSource, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const git = `${trimTrailingSlash(workspace)}/.git`;
    const kind = yield* fs.stat(git).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(undefined),
        onSuccess: (info) => Effect.succeed(info.type),
      }),
    );
    return yield* Match.value(kind).pipe(
      Match.when(undefined, () =>
        Effect.succeed<BranchSource>({
          kind: 'none',
          reason: 'missing-git',
          detail: `No .git directory or file under '${workspace}'.`,
        }),
      ),
      Match.when('Directory', () => readHead(fs, git)),
      Match.when('File', () => readWorktreeHead(fs, git, workspace)),
      Match.orElse(() =>
        Effect.succeed<BranchSource>({
          kind: 'none',
          reason: 'missing-git',
          detail: `'${git}' is neither a directory nor a file.`,
        }),
      ),
    );
  });

/**
 * Every spec directory name under `root` that holds a `SPEC.md`. One targeted
 * existence check per candidate: detection must not read every file of every
 * spec, and an unreadable file in an unrelated spec must not abort the match.
 */
export const specNames = (
  root: string,
): Effect.Effect<ReadonlyArray<string>, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    const names = yield* store.names(root);
    const held: Array<string> = [];
    for (const name of names) {
      if (yield* store.hasFile(root, name, SPEC_FILE)) held.push(name);
    }
    return held;
  });

/** Build the one diagnostic a failed resolution renders. */
export const whichDiagnostic = (root: string, miss: WhichMiss): SizingDiagnostic => {
  const fix =
    miss.candidates.length === 0
      ? `Add a spec under ${root}, then set the branch to '<prefix>/<spec-name>'.`
      : `Pass ${miss.candidates.map((name) => `--name ${name}`).join(' or ')}.`;
  return diagnostic({
    code: miss.code,
    path: root,
    field: 'branch',
    problem: miss.problem,
    rerun: 'ask the user',
    expected: miss.expected,
    actual: miss.actual,
    fix,
  });
};

/**
 * Resolve the one spec the current branch names. Reads the branch from the
 * workspace's git metadata unless `branch` overrides it, then matches it
 * through `modules/which`, the single resolver `execute` and the host tool
 * share. Fails with one agent-first diagnostic listing the candidates.
 * @param root - spec root directory
 * @param options - branch override and the workspace that holds `.git`
 * @returns the one match, failing instead of guessing
 */
export const which = (
  root: string,
  options: WhichOptions = {},
): Effect.Effect<
  WhichMatch,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecWhich',
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }
    const names = yield* specNames(root);
    const source: BranchSource =
      options.branch === undefined
        ? yield* detectBranch(options.workspace ?? '.')
        : { kind: 'branch', branch: options.branch };
    const resolution = resolveWhich({ source, names });
    if (resolution.ok) return resolution.match;
    return yield* Effect.fail(
      new SurfaceError({
        operation: 'SpecWhich',
        diagnostics: [whichDiagnostic(root, resolution.miss)],
      }),
    );
  });

/**
 * Render `which`: exactly one spec name and nothing else.
 * @param report - match from {@link which}
 * @returns the spec directory name
 */
export const renderWhich = (report: WhichMatch): string => report.name;

// ─── Author / Execute ─────────────────────────────────────────────────

/** What `author` renders from. */
export const taskFlag = Flag.String('task').pipe(Flag.withDescription('Task id, e.g. A001.'));

export const resolveCommand = Command.make(
  'resolve',
  { dir: dirFlag, name: nameFlag, task: taskFlag, verbose: verboseFlag },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* sizingOf(
          storeDirOf(config.dir),
          config.name,
          config.task,
          GUARD_RERUN.resolve,
        );
        yield* Console.log(report.target.target);
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Print one task dispatch target: provider/model#effort, or inherit. Nothing else.',
  ),
  Command.provide(SpecStore.Default),
);

export const sizingCommand = Command.make(
  'sizing',
  {
    dir: dirFlag,
    name: nameFlag,
    task: taskFlag,
    verbose: verboseFlag,
    human: Flag.Boolean('human').pipe(
      Flag.withDescription('Alias for --verbose: the full provenance matrix.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* sizingOf(storeDirOf(config.dir), config.name, config.task);
        yield* Console.log(renderSizingMode(report, config.verbose || config.human));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs check --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Inspect one task size, target, and provenance (--verbose/--human for the matrix).',
  ),
  Command.provide(SpecStore.Default),
);
