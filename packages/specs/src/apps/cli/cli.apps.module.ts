import { Console, Effect, Option } from 'effect';
import { CliError, Command, Flag } from 'effect/cli';
import { SpecStore } from '../../services/index.js';
import type { DoctorResult } from '../doctor/index.js';
import { runDoctorAt } from '../doctor/index.js';
import {
  DEFAULT_CONCURRENCY,
  LIST_STATUSES,
  check,
  checkExitCode,
  csv,
  list,
  migrate,
  next,
  renderCheck,
  renderList,
  renderMigrate,
  renderNext,
  renderScaffold,
  renderState,
  renderStatus,
  resolveListOptions,
  scaffold,
  state,
  status,
  storeDirOf,
} from './slash.apps.module.js';
import type { CheckOptions } from './slash.apps.module.js';

// ─── Commands ─────────────────────────────────────────────────────────

const dirFlag = Flag.String('dir').pipe(
  Flag.withDescription('Workspace root. Defaults to the working directory.'),
  Flag.withDefault('.'),
);

const nameFlag = Flag.String('name').pipe(Flag.withDescription('Spec directory name.'));

/** Collapse an optional flag to `string | undefined`. */
const opt = (value: Option.Option<string>): string | undefined => Option.getOrUndefined(value);

const toUserError = (error: SpecStore.StoreError): CliError.UserError =>
  new CliError.UserError({ cause: error, userMessage: error.reason });

const checkCommand = Command.make(
  'check',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    verbose: Flag.Boolean('verbose').pipe(
      Flag.withDescription('Show passing specs and the root path.'),
      Flag.withDefault(false),
    ),
    concurrency: Flag.Int('concurrency').pipe(
      Flag.withDescription('Specs verified in parallel.'),
      Flag.withDefault(DEFAULT_CONCURRENCY),
    ),
    strict: Flag.Boolean('strict').pipe(
      Flag.withDescription('Treat warnings as errors.'),
      Flag.withDefault(false),
    ),
    requireComplete: Flag.Boolean('require-complete').pipe(
      Flag.withDescription('Fail unless every checked spec status is complete.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const name = Option.isSome(config.name) ? config.name.value : undefined;
      const options: CheckOptions =
        name === undefined
          ? {
              concurrency: config.concurrency,
              strict: config.strict,
              requireComplete: config.requireComplete,
            }
          : {
              name,
              concurrency: config.concurrency,
              strict: config.strict,
              requireComplete: config.requireComplete,
            };
      const report = yield* check(storeDirOf(config.dir), options);
      yield* Console.log(renderCheck(report, config.verbose));
      const exit = checkExitCode(report);
      if (exit !== 0) {
        yield* Effect.sync(() => {
          process.exitCode = exit;
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
    const report = yield* status(storeDirOf(config.dir), config.name);
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

const createCommand = Command.make(
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
      Flag.withDescription('Comma-separated tasks, each name[:type[:gates]]. Default: implement.'),
      Flag.optional,
    ),
    reviewerProfiles: Flag.String('reviewer-profiles').pipe(
      Flag.withDescription('Comma-separated reviewer profiles for the phase review task.'),
      Flag.optional,
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const report = yield* scaffold(storeDirOf(config.dir), {
        name: config.name,
        author: opt(config.author),
        description: opt(config.description),
        workspaceType: opt(config.workspaceType),
        taskSpecs: csv(opt(config.tasks)),
        reviewerProfiles: csv(opt(config.reviewerProfiles)),
      });
      yield* Console.log(renderScaffold(report));
    }).pipe(
      Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription(
    'Scaffold a spec tree: SPEC.md, task directories, and the phase review task. Model-free.',
  ),
  Command.provide(SpecStore.Default),
);

const migrateCommand = Command.make(
  'migrate',
  {
    dir: dirFlag,
    name: Flag.optional(nameFlag),
    all: Flag.Boolean('all').pipe(
      Flag.withDescription('Migrate every spec under the root.'),
      Flag.withDefault(false),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDescription('Print the plan without moving anything.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const name = Option.isSome(config.name) ? config.name.value : undefined;
      if (name === undefined && !config.all) {
        return yield* Effect.fail(
          new CliError.UserError({
            cause: 'SpecMigrate',
            userMessage: 'migrate requires --name <spec> or --all.',
          }),
        );
      }
      const report = yield* migrate(storeDirOf(config.dir), {
        name,
        all: config.all,
        dryRun: config.dryRun,
      });
      yield* Console.log(renderMigrate(report));
      if (report.specs.some((spec) => spec.status === 'refused' || spec.status === 'failed')) {
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
      }
    }).pipe(
      Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription(
    'Move flat task directories under their phase directories, without editing a file.',
  ),
  Command.provide(SpecStore.Default),
);

const stateCommand = Command.make('state', { dir: dirFlag, name: nameFlag }, (config) =>
  Effect.gen(function* () {
    const report = yield* state(storeDirOf(config.dir), config.name);
    yield* Console.log(renderState(report));
  }).pipe(Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error)))),
).pipe(
  Command.withDescription('Print a spec derived state: status, state, active phase, locks.'),
  Command.provide(SpecStore.Default),
);

const nextCommand = Command.make('next', { dir: dirFlag, name: nameFlag }, (config) =>
  Effect.gen(function* () {
    const report = yield* next(storeDirOf(config.dir), config.name);
    yield* Console.log(renderNext(report));
  }).pipe(Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error)))),
).pipe(
  Command.withDescription('Print the ready task set for a spec active phase.'),
  Command.provide(SpecStore.Default),
);

const listCommand = Command.make(
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
    Effect.gen(function* () {
      const filter = resolveListOptions(
        Option.isSome(config.status) ? config.status.value : undefined,
        config.pending,
      );
      if ('error' in filter) {
        return yield* Effect.fail(
          new CliError.UserError({ cause: filter.error, userMessage: filter.error }),
        );
      }
      const report = yield* list(storeDirOf(config.dir), filter.options);
      yield* Console.log(renderList(report, config.verbose));
    }).pipe(
      Effect.catchTag('@montflow/SpecStoreError', (error) => Effect.fail(toUserError(error))),
    ),
).pipe(
  Command.withDescription('List specs with their derived lifecycle states.'),
  Command.provide(SpecStore.Default),
);

/**
 * Render a doctor run: the aggregate line, plus one line per skill that needs
 * attention, and the repair hint.
 * @param result - doctor outcome
 * @returns human-readable report
 */
const renderDoctor = (result: DoctorResult): string => {
  const names = result.skills.map((skill) => skill.name).join(', ');
  const head =
    result.status === 'installed'
      ? `Installed spec skills '${names}' into ${result.root}/.agents/skills/.`
      : result.status === 'ok'
        ? `Spec skills '${names}' are installed and current under ${result.root}/.agents/skills/.`
        : result.status === 'drifted'
          ? `Spec skills '${names}' are not current under ${result.root}/.agents/skills/.`
          : `Spec skills '${names}' are installed under ${result.root}/.agents/skills/.`;
  const problems = result.skills
    .filter((skill) => skill.detail !== undefined)
    .map((skill) => `  ${skill.name}: ${skill.detail}`);
  return [head, ...problems, ...(result.healthy ? [] : ['Run `mf-specs doctor` to repair.'])].join(
    '\n',
  );
};

/**
 * `doctor` command: install (or, with `--check`, verify) the packaged spec
 * skills in the repo's `.agents/skills/`. Resolves the repo root from `--dir`.
 */
const doctorCommand = Command.make(
  'doctor',
  {
    dir: dirFlag,
    check: Flag.Boolean('check').pipe(
      Flag.withDescription('Report only; never write. Exits non-zero when a skill is not current.'),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* runDoctorAt(config.dir, { check: config.check });
      yield* Console.log(renderDoctor(result));
      if (!result.healthy) {
        yield* Effect.sync(() => {
          process.exitCode = 1;
        });
      }
    }).pipe(
      Effect.catch((reason) =>
        Effect.fail(new CliError.UserError({ cause: reason, userMessage: reason })),
      ),
    ),
).pipe(Command.withDescription('Install or verify the packaged spec skills in .agents/skills/.'));

/** Root command: `mf-specs <check|status|state|next|list|create|migrate|doctor>`. */
export const rootCommand = Command.make('mf-specs').pipe(
  Command.withDescription('List, verify, scaffold, and set up montflow specs.'),
  Command.withSubcommands([
    checkCommand,
    statusCommand,
    stateCommand,
    nextCommand,
    listCommand,
    createCommand,
    migrateCommand,
    doctorCommand,
  ]),
);
