import { Console, Effect, Option } from 'effect';
import * as CliError from 'effect/unstable/cli/CliError';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';
import { type Spec, parseSpecFile } from '../../modules/spec/index.js';
import {
  type Analysis,
  type State,
  STATES,
  analyze as analyzeLifecycle,
} from '../../modules/lifecycle/index.js';
import { type SpecSnapshot, verifySpecTree } from '../../modules/structure/index.js';
import { type Task, parseTaskFile } from '../../modules/task/index.js';
import type { Issue, Result } from '../../modules/verify/index.js';
import { SpecStore } from '../../services/index.js';
import { runDoctorAt } from '../doctor/index.js';

/** Default spec root, relative to the working directory. */
export const DEFAULT_ROOT = '.agents/@montflow/specs';

/** How many specs are verified in parallel by default. */
export const DEFAULT_CONCURRENCY = 8;

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
  readonly failed: number;
  readonly issueCount: number;
}

/** Options for {@link check}. */
export interface CheckOptions {
  /** Check only this spec directory instead of the whole root. */
  readonly name?: string;
  /** Specs verified concurrently. */
  readonly concurrency?: number;
}

/**
 * Mechanically verify every spec under `root` (or one `name`). Each
 * spec is a pure `verifySpecTree` over its snapshot, so the
 * specs run concurrently. Never fails on a bad spec — bad specs
 * become failing entries; only IO failures fail.
 * @param root - spec root directory
 * @param options - optional single-spec + concurrency controls
 * @returns the aggregated report
 */
export const check = (
  root: string,
  options: CheckOptions = {},
): Effect.Effect<CheckReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
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
      return {
        root,
        specs: [{ name: options.name, valid: false, issues }],
        failed: 1,
        issueCount: 1,
      };
    }
    const names = options.name !== undefined ? [options.name] : yield* store.names(root);
    const specs = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(
          Effect.map((snapshot) => {
            const result = verifySpecTree(snapshot);
            return { name, valid: result.valid, issues: result.issues };
          }),
        ),
      { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY },
    );
    return {
      root,
      specs,
      failed: specs.filter((spec) => !spec.valid).length,
      issueCount: specs.reduce((sum, spec) => sum + spec.issues.length, 0),
    };
  });

/**
 * Render a check report. Token-lean by default — only failures and a
 * one-line summary. `verbose` also lists passing specs and the root.
 * @param report - report from {@link check}
 * @param verbose - include passing specs and the root path
 * @returns the display text
 */
export const renderCheck = (report: CheckReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const spec of report.specs) {
    if (spec.valid && !verbose) continue;
    lines.push(
      `${spec.valid ? '\u2713' : '\u2717'} ${spec.name}${spec.valid ? '' : ` (${spec.issues.length})`}`,
    );
    if (!spec.valid) {
      for (const found of spec.issues) lines.push(`  ${found.field}: ${found.message}`);
    }
  }
  if (lines.length > 0) lines.push('');
  const specCount = report.specs.length;
  lines.push(
    `${specCount} spec${specCount === 1 ? '' : 's'} \u00b7 ${report.failed} failed \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
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
 * snapshot, so both `status` and `discover` share the same summarizer.
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
  lines.push(
    `verify ${report.verify.valid ? '\u2713 verified' : `\u2717 ${report.verify.issues.length} issue${report.verify.issues.length === 1 ? '' : 's'}`}`,
  );
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

// ─── Discover ─────────────────────────────────────────────────────────

/** Derived spec states accepted by `--status`, with `completed` as an alias. */
export const DISCOVER_STATUSES: ReadonlyArray<State> = STATES;

const isSpecState = (value: string): value is State =>
  DISCOVER_STATUSES.some((state) => state === value);

/** Options for {@link discover}. */
export interface DiscoverOptions {
  /** Derived lifecycle states to keep; empty keeps every state. */
  readonly statuses?: ReadonlyArray<State> | undefined;
  /** Keep only unfinished specs (`state !== 'complete'`). */
  readonly pending?: boolean | undefined;
}

/** Discovery result over a spec root. */
export interface DiscoverReport {
  readonly root: string;
  /** Matched specs, in directory order. */
  readonly specs: ReadonlyArray<StatusReport>;
  /** Every spec under the root, before filtering. */
  readonly total: number;
  /** Specs that matched the filter. */
  readonly matched: number;
}

const matchesDiscover = (report: StatusReport, options: DiscoverOptions): boolean => {
  const state = report.state?.state;
  if (options.pending === true && state === 'complete') return false;
  const statuses = options.statuses;
  if (statuses !== undefined && statuses.length > 0) {
    if (state === undefined || !statuses.includes(state)) return false;
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
export const discover = (
  root: string,
  options: DiscoverOptions = {},
): Effect.Effect<DiscoverReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecDiscover',
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
    const specs = reports.filter((report) => matchesDiscover(report, options));
    return { root, specs, total: reports.length, matched: specs.length };
  });

/** Discovery state mark, aligned with {@link STATUS_MARK}. */
const DISCOVER_MARK = {
  complete: '\u2713',
  'in-progress': '\u2022',
  pending: '\u25cb',
  blocked: '\u2717',
  inconsistent: '\u2717',
} satisfies Record<State, string>;

/**
 * Render a discovery report: one line per matched spec, then a
 * matched-of-total summary. Token-lean; `verbose` prepends the root.
 * @param report - report from {@link discover}
 * @param verbose - include the root path
 * @returns the display text
 */
export const renderDiscover = (report: DiscoverReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const spec of report.specs) {
    const state = spec.state?.state;
    const mark = state === undefined ? '\u2717' : DISCOVER_MARK[state];
    const declared = spec.spec?.status ?? 'unreadable';
    const counts = statusCounts(spec.tasks) || `${spec.tasks.length} tasks`;
    const verdict = spec.verify.valid ? '' : ` \u00b7 \u2717 ${spec.verify.issues.length}`;
    lines.push(
      `${mark} ${spec.name}  ${declared} \u00b7 ${state ?? 'unreadable'} \u00b7 ${counts}${verdict}`,
    );
  }
  if (lines.length > 0) lines.push('');
  lines.push(
    `${report.total} spec${report.total === 1 ? '' : 's'} \u00b7 ${report.matched} matched`,
  );
  return lines.join('\n');
};

/** Parsed discovery filter: options, or a user-facing error. */
export type DiscoverFilter = { readonly options: DiscoverOptions } | { readonly error: string };

/**
 * Turn raw `--status`/`--pending` inputs into {@link DiscoverOptions}.
 * `--pending` is shorthand for every unfinished state and cannot combine
 * with `--status`; `completed` is accepted as an alias for `complete`.
 * @param rawStatuses - comma-separated `--status` value, if given
 * @param pending - whether `--pending` was set
 * @returns the options or an error message
 */
export const resolveDiscoverOptions = (
  rawStatuses: string | undefined,
  pending: boolean,
): DiscoverFilter => {
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
        error: `Unknown status '${token}'. Use one of: ${DISCOVER_STATUSES.join(', ')}.`,
      };
    }
    states.push(canonical);
  }
  return { options: { statuses: states } };
};

// ─── Commands ─────────────────────────────────────────────────────────

const dirFlag = Flag.string('dir').pipe(
  Flag.withDescription('Spec root directory.'),
  Flag.withDefault(DEFAULT_ROOT),
);

const nameFlag = Flag.string('name').pipe(Flag.withDescription('Spec directory name.'));

const toUserError = (error: SpecStore.StoreError): CliError.UserError =>
  new CliError.UserError({ cause: error, userMessage: error.reason });

const checkCommand = Command.make(
  'check',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    verbose: Flag.boolean('verbose').pipe(
      Flag.withDescription('Show passing specs and the root path.'),
      Flag.withDefault(false),
    ),
    concurrency: Flag.integer('concurrency').pipe(
      Flag.withDescription('Specs verified in parallel.'),
      Flag.withDefault(DEFAULT_CONCURRENCY),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const name = Option.isSome(config.name) ? config.name.value : undefined;
      const options: CheckOptions =
        name === undefined
          ? { concurrency: config.concurrency }
          : { name, concurrency: config.concurrency };
      const report = yield* check(config.dir, options);
      yield* Console.log(renderCheck(report, config.verbose));
      if (report.failed > 0) {
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
      }
    }).pipe(
      Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription('Mechanically verify spec files and structure.'),
  Command.provide(SpecStore.Default),
);

const statusCommand = Command.make('status', { dir: dirFlag, name: nameFlag }, (config) =>
  Effect.gen(function* () {
    const report = yield* status(config.dir, config.name);
    yield* Console.log(renderStatus(report));
    if (!report.verify.valid) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
    }
  }).pipe(Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error)))),
).pipe(
  Command.withDescription('Show the status of one spec (--name required).'),
  Command.provide(SpecStore.Default),
);

const discoverCommand = Command.make(
  'discover',
  {
    dir: dirFlag,
    status: Flag.optional(
      Flag.string('status').pipe(
        Flag.withDescription(`Comma-separated states to keep: ${DISCOVER_STATUSES.join(', ')}.`),
      ),
    ),
    pending: Flag.boolean('pending').pipe(
      Flag.withDescription('Keep only unfinished specs (state is not `complete`).'),
      Flag.withDefault(false),
    ),
    verbose: Flag.boolean('verbose').pipe(
      Flag.withDescription('Show the root path.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const filter = resolveDiscoverOptions(
        Option.isSome(config.status) ? config.status.value : undefined,
        config.pending,
      );
      if ('error' in filter) {
        return yield* Effect.fail(
          new CliError.UserError({ cause: filter.error, userMessage: filter.error }),
        );
      }
      const report = yield* discover(config.dir, filter.options);
      yield* Console.log(renderDiscover(report, config.verbose));
    }).pipe(
      Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription('List specs with their derived lifecycle states.'),
  Command.provide(SpecStore.Default),
);

/**
 * `doctor` command: install the packaged spec skills into the repo's
 * `.agents/skills/`. Resolves the repo root from the working directory.
 */
const doctorCommand = Command.make('doctor', {}, () =>
  Effect.gen(function* () {
    const result = yield* runDoctorAt(process.cwd());
    const names = result.skills.map((skill) => skill.name).join(', ');
    yield* Console.log(
      result.status === 'present'
        ? `Spec skills '${names}' are installed under ${result.root}/.agents/skills/.`
        : `Installed spec skills '${names}' into ${result.root}/.agents/skills/.`,
    );
  }).pipe(
    Effect.catch((reason) =>
      Effect.fail(new CliError.UserError({ cause: reason, userMessage: reason })),
    ),
  ),
).pipe(Command.withDescription('Install the packaged spec skills into .agents/skills/.'));

/** Root command: `mf-specs <check|status|discover|doctor>`. */
export const rootCommand = Command.make('mf-specs').pipe(
  Command.withDescription('Discover, verify, and set up montflow specs.'),
  Command.withSubcommands([checkCommand, statusCommand, discoverCommand, doctorCommand]),
);

// ─── Slash-command form ───────────────────────────────────────────────

/** Result of the slash-command form: rendered output plus a success flag. */
export interface SlashReport {
  readonly output: string;
  readonly ok: boolean;
}

/** Parsed slash args: `check`/`status`/`discover` plus their flags. */
interface SlashArgs {
  readonly command: 'check' | 'status' | 'discover';
  readonly name: string | undefined;
  readonly dir: string | undefined;
  readonly verbose: boolean;
  readonly statusFilter: string | undefined;
  readonly pending: boolean;
}

const parseSlashArgs = (args: string): SlashArgs => {
  const tokens = args.split(/\s+/).filter((token) => token !== '');
  const head = tokens[0];
  const command: SlashArgs['command'] =
    head === 'status' ? 'status' : head === 'discover' ? 'discover' : 'check';
  const rest =
    head === 'check' || head === 'status' || head === 'discover' ? tokens.slice(1) : tokens;
  let name: string | undefined;
  let dir: string | undefined;
  let statusFilter: string | undefined;
  let verbose = false;
  let pending = false;
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
    const inline = /^--(name|dir|status)=(.*)$/.exec(token);
    if (inline !== null) {
      if (inline[1] === 'name') name = inline[2];
      else if (inline[1] === 'dir') dir = inline[2];
      else statusFilter = inline[2];
      continue;
    }
    if (token === '--name' || token === '--dir' || token === '--status') {
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        if (token === '--name') name = value;
        else if (token === '--dir') dir = value;
        else statusFilter = value;
        index++;
      }
    }
  }
  return { command, name, dir, verbose, statusFilter, pending };
};

/**
 * Run the slash-command form used by the Pi extension. Never renders
 * through the CLI; returns text for `ctx.ui.notify` plus an ok flag.
 * @param args - raw slash-command args
 * @param root - default spec root, already resolved against the session cwd
 * @returns rendered output plus success flag
 */
export const runSlash = (
  args: string,
  root: string,
): Effect.Effect<SlashReport, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const parsed = parseSlashArgs(args);
    const dir = parsed.dir ?? root;
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
    if (parsed.command === 'discover') {
      const filter = resolveDiscoverOptions(parsed.statusFilter, parsed.pending);
      if ('error' in filter) {
        return yield* Effect.fail(
          new SpecStore.StoreError({ operation: 'SpecDiscover', reason: filter.error }),
        );
      }
      const report = yield* discover(dir, filter.options);
      return { output: renderDiscover(report, parsed.verbose), ok: true };
    }
    const options: CheckOptions =
      parsed.name === undefined
        ? { concurrency: DEFAULT_CONCURRENCY }
        : { name: parsed.name, concurrency: DEFAULT_CONCURRENCY };
    const report = yield* check(dir, options);
    return { output: renderCheck(report, parsed.verbose), ok: report.failed === 0 };
  });
