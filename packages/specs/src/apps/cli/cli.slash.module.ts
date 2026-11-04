import { Effect, FileSystem, Path } from 'effect';
import { Command } from 'effect/cli';
import { PromptStore } from '@montflow/prompts';

import * as Catalogue from '../../modules/catalogue/index.js';

import { renderDiagnostic } from '../../modules/diagnostic/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  workspaceOf,
  DEFAULT_CONCURRENCY,
  SURFACE_CODES,
  diagnostic,
  SurfaceError,
  type DiagnoseOptions,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  doctorCommand,
} from './cli.shared.module.js';
import { toolsCommand } from './cli.tools.module.js';
import {
  checkCommand,
  statusCommand,
  stateCommand,
  nextCommand,
  resolveCommand,
  sizingCommand,
  modelsCommand,
  whichCommand,
  listCommand,
  authorCommand,
  executeCommand,
  sizingConfigCommand,
  slashFailure,
  author,
  execute,
  sizingConfig,
  which,
  renderWhich,
  scaffold,
  dispatchErrorText,
  renderStatus,
  dispatchExitCode,
  renderState,
  next,
  renderNext,
  sizingOf,
  renderSizingMode,
  resolveListOptions,
  list,
  renderList,
  models,
  type CheckOptions,
  check,
  renderCheck,
  checkExitCode,
  createCommand,
  migrateCommand,
  gateCommand,
  mailCommand,
  claimCommand,
  initCommand,
  newPhaseCommand,
  newTaskCommand,
  stampCommand,
  tierCommand,
  lockCommand,
  waiverCommand,
  reviewCommand,
  renderScaffold,
  status,
  state,
  migrate,
  renderMigrate,
  migrateFailed,
  migrateSelectorDiagnostic,
  type SlashArgs,
  type SlashReport,
  parseSlashArgs,
  slashFlagDiagnostic,
  slashClaim,
  slashGate,
  slashInit,
  slashLock,
  slashMail,
  slashNewPhase,
  slashNewTask,
  slashStamp,
  slashTier,
  slashWaiver,
} from './cli.apps.module.js';
import * as Cli from '@montflow/version/cli';
import type { BuildInfo } from '@montflow/version';
import manifest from '../../../package.json' with { type: 'json' };

/** Spec store directory, relative to the workspace root. */

export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

export const PACKAGE_IDENTITY = {
  name: manifest.name,
  version: manifest.version,
} satisfies BuildInfo.GeneratedIdentity;

export const rootCommand = Command.make('mf-specs').pipe(
  Command.withDescription('List, verify, scaffold, inspect, and render montflow spec prompts.'),
  Command.withSubcommands([
    checkCommand,
    statusCommand,
    stateCommand,
    nextCommand,
    resolveCommand,
    sizingCommand,
    modelsCommand,
    whichCommand,
    listCommand,
    createCommand,
    migrateCommand,
    gateCommand,
    mailCommand,
    initCommand,
    newPhaseCommand,
    newTaskCommand,
    stampCommand,
    tierCommand,
    claimCommand,
    lockCommand,
    waiverCommand,
    reviewCommand,
    authorCommand,
    executeCommand,
    sizingConfigCommand,
    doctorCommand,
    toolsCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
);

/**
 * Resolve a `--dir` value against the caller's workspace. The CLI runs from the
 * workspace, so it passes nothing; the server plugin supplies one that joins
 * relative values onto the plugin directory and leaves absolute ones alone.
 */
export type ResolveSlashDir = (dir: string) => string;

/**
 * Everything one slash arm reads: parsed flags, resolved roots, and the host
 * model source.
 */
export interface SlashContext {
  readonly parsed: SlashArgs;
  readonly dir: string;
  readonly workspace: string;
  readonly catalog: string | undefined;
  readonly source: Catalogue.ModelSource | undefined;
}

/** What every slash arm returns: a rendered report or a coded failure. */
export type SlashEffect = Effect.Effect<
  SlashReport,
  SpecStore.StoreError | SurfaceError,
  SpecStore.SpecStore | FileSystem.FileSystem | Path.Path | PromptStore.PromptStore
>;

/**
 * Render one arm outcome. Any failure becomes a coded report, so an arm states
 * its outcome and its failure context once instead of repeating the catch.
 */
export const slashOutcome = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  render: (value: A) => SlashReport,
  context: DiagnoseOptions,
): Effect.Effect<SlashReport, never, R> =>
  effect.pipe(
    Effect.map(render),
    Effect.catchCause((cause) => Effect.succeed(slashFailure(cause, context))),
  );

/** `/specs author --request <text>`. */
export const slashAuthor = (context: SlashContext): SlashEffect => {
  const { parsed, workspace } = context;
  if (parsed.request === undefined || parsed.request.trim() === '') {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecAuthor',
        diagnostics: [
          diagnostic({
            code: SURFACE_CODES.invalidArgument,
            path: workspace,
            field: '--request',
            problem: 'author requires --request <text>.',
            rerun: 'mf-specs author --request <text>',
            expected: 'a non-empty --request value',
            actual: 'missing',
            fix: 'Pass --request with the text the spec should accomplish.',
          }),
        ],
      }),
    );
  }
  const request = parsed.request;
  return slashOutcome(
    author(workspace, { request, notes: parsed.notes }),
    (loaded): SlashReport => ({ output: loaded.text, ok: true }),
    { path: workspace, rerun: 'mf-specs author', verbose: parsed.verbose },
  );
};

/** `/specs execute`, optionally named, phased, focused, or autonomous. */
export const slashExecute = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  return slashOutcome(
    execute(dir, {
      name: parsed.name,
      phase: parsed.phase,
      focus: parsed.focus,
      mode: parsed.mode,
      workspace,
    }),
    (report): SlashReport => ({ output: report.prompt.text, ok: true }),
    { path: dir, rerun: 'mf-specs execute', verbose: parsed.verbose },
  );
};

/** `/specs sizing-config`, the sizing prompt for one scope. */
export const slashSizingConfig = (context: SlashContext): SlashEffect => {
  const { parsed, workspace } = context;
  return slashOutcome(
    sizingConfig(workspace, {
      scope: parsed.scope,
      name: parsed.name,
      phase: parsed.phase,
      focus: parsed.focus,
      mode: parsed.mode,
    }),
    (report): SlashReport => ({ output: report.prompt.text, ok: true }),
    { path: workspace, rerun: 'mf-specs sizing-config', verbose: parsed.verbose },
  );
};

/** `/specs which`, resolving the spec from the branch. */
export const slashWhich = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  return slashOutcome(
    which(dir, { branch: parsed.branch, workspace }),
    (report): SlashReport => ({ output: renderWhich(report), ok: true }),
    { path: dir, rerun: 'mf-specs which', verbose: parsed.verbose },
  );
};

/** `/specs create --name <spec>`, scaffolding a new spec directory. */
export const slashCreate = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  // Only a missing flag is a store-shaped "requires" error. A supplied but
  // blank or malformed `--name=` goes through the shared guard, the same coded
  // refusal every sibling arm returns for it.
  if (name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecCreate',
        reason: 'create requires --name <spec>.',
      }),
    );
  }
  if (parsed.taskError !== undefined) {
    const found = diagnostic({
      code: SURFACE_CODES.invalidArgument,
      path: name,
      field: '--tasks',
      problem: parsed.taskError,
      fix: 'Separate a following task with a semicolon (`first:execution:scope=app,build;second:execution`), not a comma.',
      rerun: `mf-specs create --name ${name}`,
    });
    return Effect.succeed({ output: renderDiagnostic(found), ok: false });
  }
  return slashOutcome(
    guardFailure('SpecCreate', guardSpecName(name, GUARD_RERUN.create)).pipe(
      Effect.andThen(
        scaffold(dir, {
          name,
          author: parsed.author,
          description: parsed.description,
          workspaceType: parsed.workspaceType,
          taskSpecs: parsed.tasks,
          reviewerProfiles: parsed.reviewerProfiles,
        }),
      ),
    ),
    (report): SlashReport => ({ output: renderScaffold(report), ok: true }),
    {
      path: name,
      rerun: `mf-specs create --name ${name}`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs migrate --name <spec>|--all [--dry-run]`. */
export const slashMigrate = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined && !parsed.all) {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecMigrate',
        diagnostics: [migrateSelectorDiagnostic()],
      }),
    );
  }
  return slashOutcome(
    migrate(dir, {
      name: parsed.name,
      all: parsed.all,
      dryRun: parsed.dryRun,
      includeComplete: parsed.switches.has('include-complete'),
    }),
    (report): SlashReport => ({ output: renderMigrate(report), ok: !migrateFailed(report) }),
    { path: dir, rerun: 'mf-specs migrate --all', verbose: parsed.verbose },
  );
};

/** `/specs status --name <spec>`. */
export const slashStatus = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecStatus',
        reason: 'status requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    status(dir, name),
    (report): SlashReport => {
      const blockers = dispatchErrorText(report.sizing, report.verify, name, parsed.verbose);
      const output =
        blockers === '' ? renderStatus(report) : `${renderStatus(report)}\n\n${blockers}`;
      return {
        output,
        ok: dispatchExitCode(report.sizing, report.verify, name) === 0,
      };
    },
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs state --name <spec>`. */
export const slashState = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecState',
        reason: 'state requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    state(dir, name),
    (report): SlashReport => ({
      output: renderState(report),
      ok: !report.blocked && report.state !== 'inconsistent',
    }),
    { path: name, rerun: `mf-specs state --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs next --name <spec>`. */
export const slashNext = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  if (parsed.name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecNext',
        reason: 'next requires --name <spec>.',
      }),
    );
  }
  const name = parsed.name;
  return slashOutcome(
    next(dir, name),
    (report): SlashReport => {
      const blockers = dispatchErrorText(report.sizing, report.verify, name, parsed.verbose);
      const output = blockers === '' ? renderNext(report) : `${renderNext(report)}\n\n${blockers}`;
      return {
        output,
        ok: dispatchExitCode(report.sizing, report.verify, name) === 0,
      };
    },
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs resolve` and `/specs sizing`, the two views of one task resolution. */
export const slashResolveOrSizing = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  const taskId = parsed.task;
  if (name === undefined || taskId === undefined || taskId === '') {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: parsed.command === 'resolve' ? 'SpecResolve' : 'SpecSizing',
        reason: `${parsed.command} requires --name <spec> and --task <id>.`,
      }),
    );
  }
  return slashOutcome(
    sizingOf(
      dir,
      name,
      taskId,
      parsed.command === 'resolve' ? GUARD_RERUN.resolve : GUARD_RERUN.sizing,
    ),
    (report): SlashReport => ({
      output:
        parsed.command === 'resolve'
          ? report.target.target
          : renderSizingMode(report, parsed.verbose || parsed.human),
      ok: true,
    }),
    { path: name, rerun: `mf-specs check --name ${name}`, verbose: parsed.verbose },
  );
};

/** `/specs list`, optionally filtered by status or pending state. */
export const slashList = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const filter = resolveListOptions(parsed.statusFilter, parsed.pending);
  if ('error' in filter) {
    return Effect.fail(new SpecStore.StoreError({ operation: 'SpecList', reason: filter.error }));
  }
  return slashOutcome(
    list(dir, filter.options),
    (report): SlashReport => ({
      output: renderList(report, parsed.verbose),
      ok: true,
    }),
    { path: dir, rerun: 'mf-specs list', verbose: parsed.verbose },
  );
};

/** `/specs models`, the catalogue table, the JSON document, or the verify pass. */
export const slashModels = (context: SlashContext): SlashEffect => {
  const { parsed, dir, catalog, source } = context;
  return slashOutcome(
    models(
      dir,
      {
        provider: parsed.provider,
        json: parsed.json,
        catalog,
        verify: parsed.verify,
        name: parsed.name,
      },
      source,
    ),
    (report): SlashReport => ({ output: report.output, ok: report.exitCode === 0 }),
    { path: dir, rerun: 'mf-specs models', verbose: parsed.verbose },
  );
};

/** `/specs check`, the fall-through command. */
export const slashCheck = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const options: CheckOptions =
    parsed.name === undefined
      ? context.catalog === undefined
        ? { concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict }
        : { concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict, catalog: context.catalog }
      : context.catalog === undefined
        ? { name: parsed.name, concurrency: DEFAULT_CONCURRENCY, strict: parsed.strict }
        : {
            name: parsed.name,
            concurrency: DEFAULT_CONCURRENCY,
            strict: parsed.strict,
            catalog: context.catalog,
          };
  return slashOutcome(
    check(dir, options),
    (report): SlashReport => ({
      output: renderCheck(report, parsed.verbose),
      ok: checkExitCode(report) === 0,
    }),
    { path: dir, rerun: 'mf-specs check', verbose: parsed.verbose },
  );
};

/**
 * Run the slash-command form registered as the OpenCode `/specs` command
 * (`src/server.ts`, through `ports.command.register`). Never renders through
 * the CLI; returns the report for the caller to log — the server writes
 * `report.output` with `Effect.logInfo` and any failure with `Effect.logError`.
 * Dispatch is exhaustive over {@link SLASH_COMMANDS}: a new command fails to
 * typecheck until it gets an arm, so it cannot silently fall through to `check`.
 * The command's flag row ({@link SLASH_COMMAND_FLAGS}) is validated first, so an
 * unknown or misplaced flag is `cli.invalid-argument` with the corrected command
 * instead of a flag that parses and changes nothing.
 * @param args - raw slash-command args
 * @param root - default spec root, already resolved against the plugin directory
 * @param resolveDir - resolver for a `--dir` value (identity by default)
 * @param source - host model source for `models`; the binary passes none
 * @returns rendered output plus success flag
 */
export const runSlash = (
  args: string,
  root: string,
  resolveDir: ResolveSlashDir = (dir) => dir,
  source?: Catalogue.ModelSource,
): Effect.Effect<
  SlashReport,
  SpecStore.StoreError | SurfaceError,
  SpecStore.SpecStore | FileSystem.FileSystem | Path.Path | PromptStore.PromptStore
> =>
  Effect.gen(function* () {
    const parsed = parseSlashArgs(args);
    // Flag validation runs before any store, prompt, or git read: a flag the
    // command does not implement is a usage error about the invocation, not a
    // property of the workspace, so it is reported even when the store is
    // missing and never costs a read.
    const refusal = slashFlagDiagnostic(parsed);
    if (refusal !== undefined) {
      return { output: renderDiagnostic(refusal), ok: false };
    }
    const workspace = parsed.dir === undefined ? workspaceOf(root) : resolveDir(parsed.dir);
    const dir = parsed.dir === undefined ? root : storeDirOf(workspace);
    const context: SlashContext = {
      parsed,
      dir,
      workspace,
      catalog: parsed.catalog === undefined ? undefined : resolveDir(parsed.catalog),
      source,
    };
    return yield* slashArm(context);
  });

/**
 * Dispatch one parsed slash command. The switch is exhaustive over
 * {@link SlashCommands}: adding a command is a compile error until it has an
 * arm, so it can never fall through to `check`.
 * @param context - parsed command, roots, and host model source
 * @returns the arm's report or coded failure
 */
export const slashArm = (context: SlashContext): SlashEffect => {
  switch (context.parsed.command) {
    case 'author':
      return slashAuthor(context);
    case 'execute':
      return slashExecute(context);
    case 'sizing-config':
      return slashSizingConfig(context);
    case 'which':
      return slashWhich(context);
    case 'create':
      return slashCreate(context);
    case 'migrate':
      return slashMigrate(context);
    case 'init':
      return slashInit(context);
    case 'new-phase':
      return slashNewPhase(context);
    case 'new-task':
      return slashNewTask(context);
    case 'stamp':
      return slashStamp(context);
    case 'tier':
      return slashTier(context);
    case 'claim':
      return slashClaim(context);
    case 'lock':
      return slashLock(context);
    case 'waiver':
      return slashWaiver(context);
    case 'gate':
      return slashGate(context);
    case 'mail':
      return slashMail(context);
    case 'status':
      return slashStatus(context);
    case 'state':
      return slashState(context);
    case 'next':
      return slashNext(context);
    case 'resolve':
    case 'sizing':
      return slashResolveOrSizing(context);
    case 'list':
      return slashList(context);
    case 'models':
      return slashModels(context);
    case 'check':
      return slashCheck(context);
  }
};
