import { Cause, Clock, Console, Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';

import { isValidName } from '../../modules/spec/index.js';
import { type State, STATES } from '../../modules/lifecycle/index.js';
import {
  isScaffoldTaskSize,
  isScaffoldTaskType,
  renderSpecScaffold,
  SCAFFOLD_TASK_TYPES,
} from '../../modules/scaffold/index.js';
import type { ScaffoldTask } from '../../modules/scaffold/index.js';
import { DEFAULT_SIZE, LAYERS, SIZES } from '../../modules/sizing/index.js';

import type { SeriesSnapshot } from '../../modules/review-link/index.js';
import { SLUG_PATTERN } from '../../modules/task/index.js';
import { type Issue, errorCount, warningCount } from '../../modules/verify/index.js';

import { SpecStore } from '../../services/index.js';
import {
  storeDirOf,
  DEFAULT_CONCURRENCY,
  SURFACE_CODES,
  diagnostic,
  SurfaceError,
  type DiagnoseOptions,
  diagnoseCause,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  runDiagnosed,
  verboseFlag,
} from './cli.shared.module.js';
import {
  type StatusReport,
  summarize,
  statusCounts,
  type SlashReport,
  reviewStoreIssue,
} from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

export const LIST_STATUSES: ReadonlyArray<State> = STATES;

export const isSpecState = (value: string): value is State =>
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

export const matchesList = (report: StatusReport, options: ListOptions): boolean => {
  const derived = report.state?.state;
  if (options.pending === true && derived === 'complete') return false;
  const statuses = options.statuses;
  if (statuses !== undefined && statuses.length > 0) {
    if (derived === undefined || !statuses.includes(derived)) return false;
  }
  return true;
};

/**
 * Read one spec's review series, degrading a failed read into the finding `check`
 * reports for it. `list` reads every spec, so one unreadable store must cost that
 * spec its review input — the row still renders, marked with the failure —
 * instead of aborting the whole listing and hiding every readable spec.
 * @param name - spec directory name
 * @param read - the review-series read for that spec
 * @returns the series (empty on failure) and the finding to report, if any
 */
export const reviewOrIssue = (
  name: string,
  read: Effect.Effect<ReadonlyArray<SeriesSnapshot>, SpecStore.StoreError>,
): Effect.Effect<{
  readonly series: ReadonlyArray<SeriesSnapshot>;
  readonly issue: Issue | undefined;
}> =>
  read.pipe(
    Effect.map((series) => ({ series, issue: undefined })),
    Effect.catchTag('@montflow/SpecStoreError', (error) =>
      Effect.succeed({ series: [], issue: reviewStoreIssue(error, { consulted: LAYERS }) }),
    ),
  );

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
        Effect.gen(function* () {
          const snapshot = yield* store.snapshot(root, name);
          const review = yield* reviewOrIssue(name, store.reviewSeries(root, name));
          const report = summarize(name, snapshot, review.series);
          if (review.issue === undefined) return report;
          return {
            ...report,
            verify: { valid: false, issues: [review.issue, ...report.verify.issues] },
          };
        }),
      { concurrency: DEFAULT_CONCURRENCY },
    );
    const specs = reports.filter((report) => matchesList(report, options));
    return { root, specs, total: reports.length, matched: specs.length };
  });

/** Listing state mark, aligned with {@link STATUS_MARK}. */
export const LIST_MARK = {
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
  /** Raw tasks, each `name[:type[:gates[:size]]]`; defaults to one `implement` task. */
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

/** Most tokens a task spec accepts: `name[:type[:gates[:size]]]`. */
export const SCAFFOLD_TASK_TOKENS = 4;

/**
 * Parse one `name[:type[:gates[:size]]]` task spec. The type defaults to
 * `execution`, the gates token is `gates` or `true` to request a `GATES.md`,
 * and the size defaults to `medium` — including when the size token is present
 * but blank, so a trailing colon means "no size here". A fifth token is
 * rejected rather than dropped.
 * @param raw - one raw task spec
 * @returns the task, or a user-facing error
 */
export const parseScaffoldTask = (raw: string): ScaffoldTaskParse => {
  const tokens = raw.split(':');
  if (tokens.length > SCAFFOLD_TASK_TOKENS) {
    return {
      ok: false,
      error: `'${raw}' has ${tokens.length} fields — use name[:type[:gates[:size]]] with at most ${SCAFFOLD_TASK_TOKENS}.`,
    };
  }
  const [name = '', type = 'execution', gates = '', declaredSize] = tokens;
  const size = declaredSize === undefined || declaredSize === '' ? DEFAULT_SIZE : declaredSize;
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
  if (!isScaffoldTaskSize(size)) {
    return {
      ok: false,
      error: `Unknown task size '${size}' — use one of: ${SIZES.join(', ')}.`,
    };
  }
  return {
    ok: true,
    task: { name, type, gates: gates === 'gates' || gates === 'true', size },
  };
};

/**
 * Scaffold a mechanically valid spec tree under `root/<name>`: `SPEC.md`,
 * one task directory per task, and the phase's review task. Deterministic
 * and model-free — the mechanical half of `mf-specs create`. A malformed name is
 * refused through the shared usage guard, so the diagnostic names `--name` and
 * the slug rule instead of a store path. Refuses to touch an existing spec
 * directory.
 * @param root - spec root directory
 * @param options - spec name, metadata, and task specs
 * @returns what was written, failing with a displayable reason
 */
export const scaffold = (
  root: string,
  options: ScaffoldOptions,
): Effect.Effect<ScaffoldReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecCreate';
    const refuse = (reason: string) => Effect.fail(new SpecStore.StoreError({ operation, reason }));
    yield* guardFailure(operation, guardSpecName(options.name, GUARD_RERUN.create));
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
          `'${profile}' is not a valid reviewer profile — use a kebab-case slug such as 'example-reviewer'.`,
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

// ─── Commands ─────────────────────────────────────────────────────────

const dirFlag = Flag.String('dir').pipe(
  Flag.withDescription('Workspace root. Defaults to the working directory.'),
  Flag.withDefault('.'),
);

const nameFlag = Flag.String('name').pipe(Flag.withDescription('Spec directory name.'));

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

/**
 * The workspace root the prompt commands read. An explicit `--dir` always
 * wins; otherwise the nearest repository root is used, so the package scripts
 * (`bun run --cwd packages/specs cli author …`) still read the repo's
 * `.agents/@montflow/prompts/` instead of the package directory.
 */
/** Comma-separated values; blank or absent reads as an empty list. */
const csv = (value: string | undefined): ReadonlyArray<string> =>
  value === undefined || value.trim() === ''
    ? []
    : value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');

/** Render a caught `Cause` as a failed slash report. */
export const slashFailure = (
  cause: Cause.Cause<unknown>,
  options: DiagnoseOptions,
): SlashReport => {
  const diagnosed = diagnoseCause(cause, options);
  return { output: diagnosed.output, ok: false };
};

/** Print output and set the process exit code when the outcome is not `0`. */
/**
 * Run a command body, catching `Cause` so no command can swallow one. An
 * expected failure renders its own coded diagnostic and exits `1`; a pure
 * interruption exits `130`; an unexpected defect is labelled internal and exits
 * `2`, with a stack only under `verbose`.
 * @param body - the command body
 * @param options - fallback path, re-run command, and verbosity, read lazily
 * @returns the body's outcome, rendered
 */
export const createCommand = Command.make(
  'create',
  {
    dir: dirFlag,
    name: nameFlag,
    author: Flag.String('author').pipe(
      Flag.withDescription('Author stamped into SPEC.md.'),
      Flag.optional,
    ),
    description: Flag.String('description').pipe(
      Flag.withDescription('One-line spec description.'),
      Flag.optional,
    ),
    workspaceType: Flag.String('workspace-type').pipe(
      Flag.withDescription("How work is isolated: 'in-place' (default) or 'worktree'."),
      Flag.optional,
    ),
    tasks: Flag.String('tasks').pipe(
      Flag.withDescription(
        'Comma-separated tasks, each name[:type[:gates[:size]]]. Default: implement.',
      ),
      Flag.optional,
    ),
    reviewerProfiles: Flag.String('reviewer-profiles').pipe(
      Flag.withDescription('Comma-separated reviewer profiles for the phase review task.'),
      Flag.optional,
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        // The name is validated before --tasks, so a malformed name is the
        // first diagnostic instead of a task error about a spec that cannot
        // exist at that path.
        yield* guardFailure('SpecsCreate', guardSpecName(config.name, GUARD_RERUN.create));
        const taskSpecs = csv(opt(config.tasks));
        for (const raw of taskSpecs) {
          const parsed = parseScaffoldTask(raw);
          if (!parsed.ok) {
            return yield* Effect.fail(
              new SurfaceError({
                operation: 'SpecsCreate',
                diagnostics: [
                  diagnostic({
                    code: SURFACE_CODES.invalidArgument,
                    path: config.name,
                    field: '--tasks',
                    problem: parsed.error,
                    fix: 'Pass each task as name[:type[:gates[:size]]].',
                    rerun: `mf-specs create --name ${config.name}`,
                  }),
                ],
              }),
            );
          }
        }
        const report = yield* scaffold(storeDirOf(config.dir), {
          name: config.name,
          author: opt(config.author),
          description: opt(config.description),
          workspaceType: opt(config.workspaceType),
          taskSpecs,
          reviewerProfiles: csv(opt(config.reviewerProfiles)),
        });
        yield* Console.log(renderScaffold(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs create --name ${config.name}`,
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Scaffold a spec tree: SPEC.md, task directories, and the phase review task. Model-free.',
  ),
  Command.provide(SpecStore.Default),
);

export const listCommand = Command.make(
  'list',
  {
    dir: dirFlag,
    status: Flag.optional(
      Flag.String('status').pipe(
        Flag.withDescription(`Comma-separated states to keep: ${LIST_STATUSES.join(', ')}.`),
      ),
    ),
    pending: Flag.Boolean('pending').pipe(
      Flag.withDescription('Keep only unfinished specs (state is not `complete`).'),
      Flag.withDefault(false),
    ),
    verbose: Flag.Boolean('verbose').pipe(
      Flag.withDescription('Show the root path.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const filter = resolveListOptions(
          Option.isSome(config.status) ? config.status.value : undefined,
          config.pending,
        );
        if ('error' in filter) {
          return yield* Effect.fail(
            new SurfaceError({
              operation: 'SpecsList',
              diagnostics: [
                diagnostic({
                  code: SURFACE_CODES.invalidArgument,
                  path: storeDirOf(config.dir),
                  field: '--status',
                  problem: filter.error,
                  fix: `Pass --status with one of: ${LIST_STATUSES.join(', ')}.`,
                  rerun: 'mf-specs list',
                }),
              ],
            }),
          );
        }
        const report = yield* list(storeDirOf(config.dir), filter.options);
        yield* Console.log(renderList(report, config.verbose));
      }),
      () => ({
        path: storeDirOf(config.dir),
        rerun: 'mf-specs list',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription('List specs with their derived lifecycle states.'),
  Command.provide(SpecStore.Default),
);

/**
 * The mark a doctor payload line leads with: `✓` for a current copy, `+` for
 * one doctor wrote, `✗` for one that needs attention.
 * @param payload - one skill or prompt outcome
 * @returns the leading mark
 */
