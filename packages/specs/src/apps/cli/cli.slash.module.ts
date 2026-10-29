import { Effect, FileSystem, Match } from 'effect';
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
  type SizingDiagnostic,
  diagnostic,
  SurfaceError,
  type DiagnoseOptions,
  GUARD_RERUN,
  guardSpecName,
  guardFailure,
  csv,
  doctorCommand,
} from './cli.shared.module.js';
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
  renderScaffold,
  status,
  state,
} from './cli.apps.module.js';
/** Spec store directory, relative to the workspace root. */

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
    authorCommand,
    executeCommand,
    sizingConfigCommand,
    doctorCommand,
  ]),
);

// ─── Slash-command form ───────────────────────────────────────────────

/** Result of the slash-command form: rendered output plus a success flag. */
export interface SlashReport {
  readonly output: string;
  readonly ok: boolean;
}

/**
 * Every slash head that names a command explicitly. This is the one list: it
 * types {@link SlashArgs}, decides whether the first token is a command, and
 * therefore what the remaining tokens mean. Anything else runs `check`.
 */
export const SLASH_COMMANDS = [
  'check',
  'status',
  'state',
  'next',
  'resolve',
  'sizing',
  'models',
  'which',
  'list',
  'create',
  'author',
  'execute',
  'sizing-config',
] as const;

/** A slash command name. */
export type SlashCommand = (typeof SLASH_COMMANDS)[number];

/** True when `value` names a slash command. */
export const isSlashCommand = (value: string | undefined): value is SlashCommand =>
  value !== undefined && SLASH_COMMANDS.some((command) => command === value);

/**
 * Kind of every slash flag: `switch` takes no value and sets a boolean,
 * `value` requires one. One table types both the parser and each command's row,
 * so a misspelled flag or a switch listed with a value fails typecheck instead
 * of parsing into a silent no-op.
 */
export const SLASH_FLAG_KINDS = {
  dir: 'value',
  verbose: 'switch',
  name: 'value',
  strict: 'switch',
  task: 'value',
  human: 'switch',
  provider: 'value',
  json: 'switch',
  catalog: 'value',
  verify: 'switch',
  branch: 'value',
  status: 'value',
  pending: 'switch',
  description: 'value',
  author: 'value',
  'workspace-type': 'value',
  tasks: 'value',
  'reviewer-profiles': 'value',
  request: 'value',
  notes: 'value',
  scope: 'value',
  phase: 'value',
  focus: 'value',
  mode: 'value',
} as const satisfies Record<string, 'switch' | 'value'>;

/** A flag name the slash form implements anywhere. */
export type SlashFlagName = keyof typeof SLASH_FLAG_KINDS;

/** A flag's shape: a value flag or a switch. */
export type SlashFlagKind = (typeof SLASH_FLAG_KINDS)[SlashFlagName];

/** Flags every slash command accepts. */
export const SLASH_COMMON_FLAGS: ReadonlyArray<SlashFlagName> = ['dir', 'verbose'];

/**
 * The flags each slash command implements, beyond the common pair. This is the
 * contract the parser enforces: a flag outside a command's row is refused with
 * `cli.invalid-argument` instead of being parsed and silently ignored, so a
 * caller can never believe `--json` or `--scope` did something on a verb that
 * has no such behavior. Adding a flag to a slash arm means adding it here, so
 * the refusal and the implementation cannot drift apart; the element type is
 * the known-flag union, so a typo fails typecheck.
 */
export const SLASH_COMMAND_FLAGS = {
  check: ['name', 'strict', 'catalog'],
  status: ['name'],
  state: ['name'],
  next: ['name'],
  resolve: ['name', 'task'],
  sizing: ['name', 'task', 'human'],
  models: ['provider', 'json', 'catalog', 'verify', 'name'],
  which: ['branch'],
  list: ['status', 'pending'],
  create: ['name', 'description', 'author', 'workspace-type', 'tasks', 'reviewer-profiles'],
  author: ['request', 'notes'],
  execute: ['name', 'phase', 'focus', 'mode'],
  'sizing-config': ['scope', 'name', 'phase', 'focus', 'mode'],
} as const satisfies Record<SlashCommand, ReadonlyArray<SlashFlagName>>;

/** Every flag one command implements, common flags first. */
export const slashFlagsOf = (command: SlashCommand): ReadonlyArray<SlashFlagName> => [
  ...SLASH_COMMON_FLAGS,
  ...SLASH_COMMAND_FLAGS[command],
];

/** True when `value` names a flag the slash form implements anywhere. */
export const isSlashFlagName = (value: string): value is SlashFlagName =>
  Object.hasOwn(SLASH_FLAG_KINDS, value);

/** Shape of one flag name, or `unknown` when no slash command reads it. */
export const slashFlagKind = (flag: string): SlashFlagKind | 'unknown' =>
  isSlashFlagName(flag) ? SLASH_FLAG_KINDS[flag] : 'unknown';

/** One flag token exactly as the caller wrote it. */
export interface SlashFlagToken {
  /** Flag name without the leading dashes. */
  readonly flag: string;
  /** Shape the name has in {@link SLASH_FLAG_KINDS}; `unknown` reads no value. */
  readonly kind: SlashFlagKind | 'unknown';
  /** Value as supplied; absent for a switch or a value flag with no value. */
  readonly value: string | undefined;
}

/** Parsed slash args: a command plus its flags. */
export interface SlashArgs {
  readonly command: SlashCommand;
  /** Every flag token in argument order, for per-command validation. */
  readonly flags: ReadonlyArray<SlashFlagToken>;
  readonly name: string | undefined;
  readonly dir: string | undefined;
  readonly task: string | undefined;
  readonly branch: string | undefined;
  readonly provider: string | undefined;
  readonly catalog: string | undefined;
  readonly verbose: boolean;
  readonly human: boolean;
  readonly strict: boolean;
  readonly json: boolean;
  readonly verify: boolean;
  readonly statusFilter: string | undefined;
  readonly pending: boolean;
  readonly description: string | undefined;
  readonly author: string | undefined;
  readonly workspaceType: string | undefined;
  readonly tasks: ReadonlyArray<string>;
  readonly reviewerProfiles: ReadonlyArray<string>;
  readonly request: string | undefined;
  readonly notes: string | undefined;
  readonly scope: string | undefined;
  readonly phase: string | undefined;
  readonly focus: string | undefined;
  readonly mode: string | undefined;
}

/**
 * Value flags whose value may be prose. Their tokens are joined up to the next
 * `--flag`, so `/specs author --request Ship login` keeps its spaces without
 * requiring quotes the slash parser cannot see. The `=` form joins the same way
 * (`--request=Ship login`), so the two spellings never disagree about the value.
 */
export const SLASH_PROSE_FLAGS: ReadonlySet<SlashFlagName> = new Set(['request', 'notes', 'focus']);

/**
 * Join a prose value onto the words that follow it, stopping at the next
 * `--flag`. Both flag spellings share it, so the `=` form cannot silently
 * truncate a request at its first space.
 * @param first - the value already read
 * @param rest - the remaining tokens
 * @param from - index of the first token after the value
 * @returns the joined prose and the index of the last token it consumed
 */
export const joinProse = (first: string, rest: ReadonlyArray<string>, from: number) => {
  const parts: Array<string> = first === '' ? [] : [first];
  let index = from;
  while (index < rest.length && !(rest[index] ?? '').startsWith('--')) {
    parts.push(rest[index] ?? '');
    index++;
  }
  return { text: parts.join(' '), last: index - 1 };
};

export const parseSlashArgs = (args: string): SlashArgs => {
  const tokens = args.split(/\s+/).filter((token) => token !== '');
  const head = tokens[0];
  const known = isSlashCommand(head);
  const command: SlashCommand = isSlashCommand(head) ? head : 'check';
  const rest = known ? tokens.slice(1) : tokens;
  let tasks: ReadonlyArray<string> = [];
  let reviewerProfiles: ReadonlyArray<string> = [];
  let verbose = false;
  let human = false;
  let pending = false;
  let strict = false;
  let json = false;
  let verify = false;
  // Every flag token in order, so the command's own row can be enforced.
  const flags: Array<SlashFlagToken> = [];
  const record = (
    flag: string,
    value: string | undefined,
    kind: SlashFlagKind | 'unknown',
  ): void => {
    flags.push({ flag, kind, value });
  };
  // Every value flag without a bespoke reader lands here by its flag name, so
  // adding a flag means one entry in SLASH_FLAG_KINDS, never another arm.
  const values: Record<string, string> = {};
  const assign = (key: string, value: string): void => {
    if (key === 'tasks') tasks = csv(value);
    else if (key === 'reviewer-profiles') reviewerProfiles = csv(value);
    else values[key] = value;
  };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] ?? '';
    if (token === '--verbose' || token === '-v') {
      verbose = true;
      record('verbose', undefined, 'switch');
      continue;
    }
    if (token === '--human') {
      human = true;
      record('human', undefined, 'switch');
      continue;
    }
    if (token === '--pending') {
      pending = true;
      record('pending', undefined, 'switch');
      continue;
    }
    if (token === '--strict') {
      strict = true;
      record('strict', undefined, 'switch');
      continue;
    }
    if (token === '--json') {
      json = true;
      record('json', undefined, 'switch');
      continue;
    }
    if (token === '--verify') {
      verify = true;
      record('verify', undefined, 'switch');
      continue;
    }
    const inline = /^--([\w-]+)=(.*)$/.exec(token);
    if (inline !== null) {
      const key = inline[1] ?? '';
      const kind = slashFlagKind(key);
      // The prose flags join the words after the inline value exactly like the
      // space form, so `--request=Ship login` is the same request as
      // `--request Ship login` instead of `Ship` plus a dropped `login`.
      if (kind === 'value' && isSlashFlagName(key) && SLASH_PROSE_FLAGS.has(key)) {
        const prose = joinProse(inline[2] ?? '', rest, index + 1);
        record(key, prose.text, 'value');
        assign(key, prose.text);
        index = prose.last;
        continue;
      }
      // A switch given a value is recorded as a switch and never set: the
      // command's row refuses it with `cli.invalid-argument`, so `--strict=true`
      // cannot pass as an advisory run. Only a value flag is assigned.
      record(key, inline[2] ?? '', kind);
      if (kind === 'value') assign(key, inline[2] ?? '');
      continue;
    }
    if (token.startsWith('--') && slashFlagKind(token.slice(2)) === 'value') {
      const key = token.slice(2);
      const value = rest[index + 1];
      if (value !== undefined && !value.startsWith('--')) {
        const prose =
          isSlashFlagName(key) && SLASH_PROSE_FLAGS.has(key)
            ? joinProse(value, rest, index + 2)
            : { text: value, last: index + 1 };
        record(key, prose.text, 'value');
        assign(key, prose.text);
        index = prose.last;
        continue;
      }
      // A value flag with no value is still recorded, so the command reports
      // the missing value instead of the parser dropping the flag silently.
      record(key, undefined, 'value');
      continue;
    }
    // Any other `--token`. Switch flags are read above, so this one has no
    // reader at all: recorded, then refused by the command's flag row. A bare
    // word is a stray positional token, which no command reads either.
    if (token.startsWith('--')) record(token.slice(2), undefined, 'unknown');
  }
  return {
    command,
    flags,
    name: values.name,
    dir: values.dir,
    task: values.task,
    branch: values.branch,
    provider: values.provider,
    catalog: values.catalog,
    verbose,
    human,
    strict,
    json,
    verify,
    statusFilter: values.status,
    pending,
    description: values.description,
    author: values.author,
    workspaceType: values['workspace-type'],
    tasks,
    reviewerProfiles,
    request: values.request,
    notes: values.notes,
    scope: values.scope,
    phase: values.phase,
    focus: values.focus,
    mode: values.mode,
  };
};

/** A flag rendered the way the caller wrote it, for `actual` rows. */
export const rawFlagText = (flag: SlashFlagToken): string =>
  flag.value === undefined ? `--${flag.flag}` : `--${flag.flag} ${flag.value}`;

/**
 * A flag rendered for a corrected command. A switch renders bare even when the
 * caller wrote `=value`, so the printed repair is the form that runs.
 */
export const flagText = (flag: SlashFlagToken): string =>
  flag.value === undefined || flag.kind === 'switch'
    ? `--${flag.flag}`
    : `--${flag.flag} ${flag.value}`;

/** The commands that implement one flag, in the canonical command order. */
export const flagOwners = (flag: string): ReadonlyArray<SlashCommand> =>
  isSlashFlagName(flag)
    ? SLASH_COMMANDS.filter((command) => slashFlagsOf(command).includes(flag))
    : [];

/** Commands that cannot run without `--name`, so a suggested command names one. */
export const SLASH_NEEDS_NAME: ReadonlySet<SlashCommand> = new Set(['resolve', 'sizing']);

/** The flags of `supplied` that one command implements, in argument order. */
export const carriedFlags = (
  command: SlashCommand,
  supplied: ReadonlyArray<SlashFlagToken>,
): ReadonlyArray<SlashFlagToken> =>
  supplied.filter(
    (flag) => isSlashFlagName(flag.flag) && slashFlagsOf(command).includes(flag.flag),
  );

/** The caller's command carrying only the flags that command implements. */
export const correctedCommand = (
  command: SlashCommand,
  supplied: ReadonlyArray<SlashFlagToken>,
): string => [`/specs ${command}`, ...carriedFlags(command, supplied).map(flagText)].join(' ');

/**
 * The command that does implement a misplaced flag, carrying every supplied
 * flag it also implements. `resolve` / `sizing` get a `--name <spec>`
 * placeholder because neither runs without one, so the printed command is one
 * the caller can run after substituting the spec.
 */
export const ownerCommand = (
  owner: SlashCommand,
  supplied: ReadonlyArray<SlashFlagToken>,
): string => {
  const carried = carriedFlags(owner, supplied);
  const parts = [`/specs ${owner}`];
  if (SLASH_NEEDS_NAME.has(owner) && !carried.some((flag) => flag.flag === 'name')) {
    parts.push('--name <spec>');
  }
  for (const flag of carried) parts.push(flagText(flag));
  return parts.join(' ');
};

/**
 * The first flag a slash command cannot accept, as the coded usage refusal. Two
 * shapes are refused: a flag outside the command's row (a flag another command
 * implements names that command and carries the supplied flags it also reads,
 * so `/specs execute --scope repo` prints `/specs sizing-config --scope repo`
 * instead of a dead end), and a switch written with an inline value
 * (`--strict=true`), which names the bare switch because the parser never sets
 * it. A flag no command reads is refused with the row this command does accept.
 * @param parsed - the parsed command and its flag tokens
 * @returns the refusal, or undefined when every flag belongs to the command
 */
export const slashFlagDiagnostic = (parsed: SlashArgs): SizingDiagnostic | undefined => {
  const allowed = slashFlagsOf(parsed.command);
  const bad = parsed.flags.find(
    (flag) => !isSlashFlagName(flag.flag) || !allowed.includes(flag.flag),
  );
  if (bad !== undefined) {
    const owners = flagOwners(bad.flag);
    const home = owners[0];
    const field = `--${bad.flag}`;
    const accepted = allowed.map((flag) => `--${flag}`).join(', ');
    const corrected = correctedCommand(parsed.command, parsed.flags);
    const homeCommand = home === undefined ? undefined : ownerCommand(home, parsed.flags);
    const elsewhere = owners
      .slice(1)
      .map((owner) => `/specs ${owner}`)
      .join(' or ');
    return diagnostic({
      code: SURFACE_CODES.invalidArgument,
      path: parsed.command,
      field,
      problem:
        bad.kind === 'unknown'
          ? `Flag ${field} is not a flag any /specs command implements.`
          : `Flag ${field} is not implemented by /specs ${parsed.command}.`,
      rerun: homeCommand ?? corrected,
      expected: `${accepted} on /specs ${parsed.command}`,
      actual: rawFlagText(bad),
      fix:
        homeCommand === undefined
          ? `Drop ${field}: /specs ${parsed.command} implements ${accepted}.`
          : `Run ${homeCommand} instead${elsewhere === '' ? '' : ` (or ${elsewhere})`}, or drop ${field} to keep /specs ${parsed.command}: ${corrected}.`,
    });
  }
  // A switch carries no value. The parser leaves it unset when the caller
  // writes `=value`, so accepting the name alone would be a silent no-op.
  const switchWithValue = parsed.flags.find(
    (flag) =>
      flag.kind === 'switch' &&
      flag.value !== undefined &&
      isSlashFlagName(flag.flag) &&
      allowed.includes(flag.flag),
  );
  if (switchWithValue === undefined) return undefined;
  const field = `--${switchWithValue.flag}`;
  const corrected = correctedCommand(parsed.command, parsed.flags);
  return diagnostic({
    code: SURFACE_CODES.invalidArgument,
    path: parsed.command,
    field,
    problem: `Flag ${field} is a switch and takes no value on /specs ${parsed.command}.`,
    rerun: corrected,
    expected: `${field} without a value on /specs ${parsed.command}`,
    actual: rawFlagText(switchWithValue),
    fix: `Write ${field} alone: ${corrected}.`,
  });
};

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
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
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
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
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
    return yield* Match.value(parsed.command).pipe(
      Match.when('author', () => slashAuthor(context)),
      Match.when('execute', () => slashExecute(context)),
      Match.when('sizing-config', () => slashSizingConfig(context)),
      Match.when('which', () => slashWhich(context)),
      Match.when('create', () => slashCreate(context)),
      Match.when('status', () => slashStatus(context)),
      Match.when('state', () => slashState(context)),
      Match.when('next', () => slashNext(context)),
      Match.whenOr('resolve', 'sizing', () => slashResolveOrSizing(context)),
      Match.when('list', () => slashList(context)),
      Match.when('models', () => slashModels(context)),
      Match.when('check', () => slashCheck(context)),
      Match.exhaustive,
    );
  });
