import { Console, Effect, Option } from 'effect';
import * as CliError from 'effect/unstable/cli/CliError';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';
import { type Feature, parseFeatureFile } from '../../modules/feature/index.js';
import { type Analysis, analyze as analyzeLifecycle } from '../../modules/lifecycle/index.js';
import { verifyFeatureTree } from '../../modules/structure/index.js';
import { type Task, parseTaskFile } from '../../modules/task/index.js';
import type { Issue, Result } from '../../modules/verify/index.js';
import { FeatureStore } from '../../services/index.js';

/** Default feature root, relative to the working directory. */
export const DEFAULT_ROOT = '.agents/@montflow/features';

/** How many features are verified in parallel by default. */
export const DEFAULT_CONCURRENCY = 8;

// ─── Check ────────────────────────────────────────────────────────────

/** Verification outcome for one feature. */
export interface CheckFeature {
  readonly name: string;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** Whole-run check result. */
export interface CheckReport {
  readonly root: string;
  readonly features: ReadonlyArray<CheckFeature>;
  readonly failed: number;
  readonly issueCount: number;
}

/** Options for {@link check}. */
export interface CheckOptions {
  /** Check only this feature directory instead of the whole root. */
  readonly name?: string;
  /** Features verified concurrently. */
  readonly concurrency?: number;
}

/**
 * Mechanically verify every feature under `root` (or one `name`). Each
 * feature is a pure `verifyFeatureTree` over its snapshot, so the
 * features run concurrently. Never fails on a bad feature — bad features
 * become failing entries; only IO failures fail.
 * @param root - feature root directory
 * @param options - optional single-feature + concurrency controls
 * @returns the aggregated report
 */
export const check = (
  root: string,
  options: CheckOptions = {},
): Effect.Effect<CheckReport, FeatureStore.StoreError, FeatureStore.FeatureStore> =>
  Effect.gen(function* () {
    const store = yield* FeatureStore.FeatureStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new FeatureStore.StoreError({
          operation: 'FeatureCheck',
          reason: `Features directory not found: ${root}`,
        }),
      );
    }
    if (options.name !== undefined && !(yield* store.exists(root, options.name))) {
      const issues: ReadonlyArray<Issue> = [
        { field: options.name, message: `Feature directory not found under ${root}.` },
      ];
      return {
        root,
        features: [{ name: options.name, valid: false, issues }],
        failed: 1,
        issueCount: 1,
      };
    }
    const names = options.name !== undefined ? [options.name] : yield* store.names(root);
    const features = yield* Effect.forEach(
      names,
      (name) =>
        store.snapshot(root, name).pipe(
          Effect.map((snapshot) => {
            const result = verifyFeatureTree(snapshot);
            return { name, valid: result.valid, issues: result.issues };
          }),
        ),
      { concurrency: options.concurrency ?? DEFAULT_CONCURRENCY },
    );
    return {
      root,
      features,
      failed: features.filter((feature) => !feature.valid).length,
      issueCount: features.reduce((sum, feature) => sum + feature.issues.length, 0),
    };
  });

/**
 * Render a check report. Token-lean by default — only failures and a
 * one-line summary. `verbose` also lists passing features and the root.
 * @param report - report from {@link check}
 * @param verbose - include passing features and the root path
 * @returns the display text
 */
export const renderCheck = (report: CheckReport, verbose: boolean): string => {
  const lines: Array<string> = [];
  if (verbose) lines.push(`root ${report.root}`);
  for (const feature of report.features) {
    if (feature.valid && !verbose) continue;
    lines.push(
      `${feature.valid ? '\u2713' : '\u2717'} ${feature.name}${feature.valid ? '' : ` (${feature.issues.length})`}`,
    );
    if (!feature.valid) {
      for (const found of feature.issues) lines.push(`  ${found.field}: ${found.message}`);
    }
  }
  if (lines.length > 0) lines.push('');
  const featureCount = report.features.length;
  lines.push(
    `${featureCount} feature${featureCount === 1 ? '' : 's'} \u00b7 ${report.failed} failed \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
};

// ─── Status ───────────────────────────────────────────────────────────

/** Status report for one feature. */
export interface StatusReport {
  readonly name: string;
  readonly feature: Feature | undefined;
  readonly tasks: ReadonlyArray<Task>;
  /** Derived lifecycle analysis; undefined when FEATURE.md does not parse. */
  readonly state: Analysis | undefined;
  readonly verify: Result;
}

/**
 * Read one feature and summarize it. Fails only on IO / missing feature.
 * @param root - feature root directory
 * @param name - feature directory name
 * @returns the status report
 */
export const status = (
  root: string,
  name: string,
): Effect.Effect<StatusReport, FeatureStore.StoreError, FeatureStore.FeatureStore> =>
  Effect.gen(function* () {
    const store = yield* FeatureStore.FeatureStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new FeatureStore.StoreError({
          operation: 'FeatureStatus',
          reason: `Features directory not found: ${root}`,
        }),
      );
    }
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new FeatureStore.StoreError({
          operation: 'FeatureStatus',
          reason: `Feature '${name}' not found under ${root}.`,
        }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const featureFile = snapshot.files.find((file) => file.path === 'FEATURE.md');
    const feature = featureFile === undefined ? undefined : parseFeatureFile(featureFile.content);
    const tasks: Array<Task> = [];
    for (const file of snapshot.files) {
      if (!file.path.endsWith('/TASK.md')) continue;
      const task = parseTaskFile(file.content);
      if (task !== undefined) tasks.push(task);
    }
    const ordered = tasks.toSorted((a, b) => a.id.localeCompare(b.id));
    return {
      name,
      feature,
      tasks: ordered,
      state:
        feature === undefined
          ? undefined
          : analyzeLifecycle({
              status: feature.status,
              lockedPhases: feature.lockedPhases,
              tasks: ordered.map((task) => ({ id: task.id, status: task.status })),
            }),
      verify: verifyFeatureTree(snapshot),
    };
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
 * Render a human-readable status panel for one feature.
 * @param report - report from {@link status}
 * @returns the display text
 */
export const renderStatus = (report: StatusReport): string => {
  const lines: Array<string> = [];
  const feature = report.feature;
  if (feature === undefined) {
    lines.push(`${report.name} \u00b7 unreadable FEATURE.md`);
  } else {
    lines.push(`${feature.name} \u00b7 ${feature.status} \u00b7 ${feature.workspaceType}`);
    if (report.state !== undefined) lines.push(`state ${report.state.state}`);
    const locked =
      feature.lockedPhases.length > 0 ? ` \u00b7 locked ${feature.lockedPhases.join(',')}` : '';
    lines.push(`author ${feature.author} \u00b7 created ${feature.created}${locked}`);
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

// ─── Commands ─────────────────────────────────────────────────────────

const dirFlag = Flag.string('dir').pipe(
  Flag.withDescription('Feature root directory.'),
  Flag.withDefault(DEFAULT_ROOT),
);

const nameFlag = Flag.string('name').pipe(Flag.withDescription('Feature directory name.'));

const toUserError = (error: FeatureStore.StoreError): CliError.UserError =>
  new CliError.UserError({ cause: error, userMessage: error.reason });

const checkCommand = Command.make(
  'check',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    verbose: Flag.boolean('verbose').pipe(
      Flag.withDescription('Show passing features and the root path.'),
      Flag.withDefault(false),
    ),
    concurrency: Flag.integer('concurrency').pipe(
      Flag.withDescription('Features verified in parallel.'),
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
      Effect.catchTag('@montflow/FeatureStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription('Mechanically verify feature spec files and structure.'),
  Command.provide(FeatureStore.Default),
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
  }).pipe(
    Effect.catchTag('@montflow/FeatureStoreError', (error) => Effect.fail(toUserError(error))),
  ),
).pipe(
  Command.withDescription('Show the status of one feature (--name required).'),
  Command.provide(FeatureStore.Default),
);

/** Root command: `mf-features <check|status>`. */
export const rootCommand = Command.make('mf-features').pipe(
  Command.withDescription('Verify montflow feature specs.'),
  Command.withSubcommands([checkCommand, statusCommand]),
);

// ─── Slash-command form ───────────────────────────────────────────────

/** Result of the slash-command form: rendered output plus a success flag. */
export interface SlashReport {
  readonly output: string;
  readonly ok: boolean;
}

/** Parsed slash args: `check`/`status` plus `--name`, `--dir`, `--verbose`. */
interface SlashArgs {
  readonly command: 'check' | 'status';
  readonly name: string | undefined;
  readonly dir: string | undefined;
  readonly verbose: boolean;
}

const parseSlashArgs = (args: string): SlashArgs => {
  const tokens = args.split(/\s+/).filter((token) => token !== '');
  const head = tokens[0];
  const command: 'check' | 'status' = head === 'status' ? 'status' : 'check';
  const rest = head === 'check' || head === 'status' ? tokens.slice(1) : tokens;
  let name: string | undefined;
  let dir: string | undefined;
  let verbose = false;
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] ?? '';
    if (token === '--verbose' || token === '-v') {
      verbose = true;
      continue;
    }
    const inline = /^--(name|dir)=(.*)$/.exec(token);
    if (inline !== null) {
      if (inline[1] === 'name') name = inline[2];
      else dir = inline[2];
      continue;
    }
    if (token === '--name' || token === '--dir') {
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        if (token === '--name') name = value;
        else dir = value;
        index++;
      }
    }
  }
  return { command, name, dir, verbose };
};

/**
 * Run the slash-command form used by the Pi extension. Never renders
 * through the CLI; returns text for `ctx.ui.notify` plus an ok flag.
 * @param args - raw slash-command args
 * @param root - default feature root, already resolved against the session cwd
 * @returns rendered output plus success flag
 */
export const runSlash = (
  args: string,
  root: string,
): Effect.Effect<SlashReport, FeatureStore.StoreError, FeatureStore.FeatureStore> =>
  Effect.gen(function* () {
    const parsed = parseSlashArgs(args);
    const dir = parsed.dir ?? root;
    if (parsed.command === 'status') {
      if (parsed.name === undefined || parsed.name === '') {
        return yield* Effect.fail(
          new FeatureStore.StoreError({
            operation: 'FeatureStatus',
            reason: 'status requires --name <feature>.',
          }),
        );
      }
      const report = yield* status(dir, parsed.name);
      return { output: renderStatus(report), ok: report.verify.valid };
    }
    const options: CheckOptions =
      parsed.name === undefined
        ? { concurrency: DEFAULT_CONCURRENCY }
        : { name: parsed.name, concurrency: DEFAULT_CONCURRENCY };
    const report = yield* check(dir, options);
    return { output: renderCheck(report, parsed.verbose), ok: report.failed === 0 };
  });
