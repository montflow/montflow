import type { ServerPorts } from '@montflow/opencode';
import { Effect } from 'effect';
import type { Scope } from 'effect';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `/mf-references` slash-command front end: a hand-rolled parser over the
 * same engines the `mf-references` binary uses.
 *
 * A bespoke parser rather than `effect/cli` because a slash command receives a
 * single argument *string*, not an argv array. Everything below the parser is
 * shared, and the flag sets match the binary verb for verb.
 */

/** Slash-command name (invoke as `/mf-references`). */
export const COMMAND_NAME = 'mf-references';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Run the mf-references CLI headlessly: doctor [--check], list [--status installed|missing], show <name>, verify [<name>|--all] [--clones], add <url> [--name <slug>] [--ref <ref>] [--purpose <text>], update <name|url>|--all [--force], sync <name>|--all, status [<name>] [--fetch], remove <name> [--keep-clone], or help. Every verb accepts --dir to target a workspace root; the verbs that render rows also accept --human and --verbose.';

/** Usage line notified by the `help` action. */
export const USAGE = `/mf-references doctor [--check] [--human] [--verbose] [--dir path]
/mf-references list [--status installed|missing] [--human] [--verbose] [--dir path]
/mf-references show <name> [--dir path]
/mf-references verify [<name>|--all] [--clones] [--human] [--verbose] [--dir path]
/mf-references add <url> [--name slug] [--ref ref] [--purpose text] [--human] [--verbose] [--dir path]
/mf-references update <name|url>|--all [--force] [--human] [--verbose] [--dir path]
/mf-references sync <name>|--all [--human] [--verbose] [--dir path]
/mf-references status [<name>] [--fetch] [--human] [--verbose] [--dir path]
/mf-references remove <name> [--keep-clone] [--human] [--verbose] [--dir path]
/mf-references help`;

/** One verb's flag vocabulary. Unknown flags are a usage error. */
interface FlagSpec {
  readonly strings: ReadonlyArray<string>;
  readonly booleans: ReadonlyArray<string>;
}

/** Flags shared by every verb except `show`, whose output is the file. */
const OUTPUT_FLAGS: FlagSpec = {
  strings: ['dir'],
  booleans: ['human', 'verbose'],
};

/** Union of two flag specs. */
const withFlags = (
  base: FlagSpec,
  strings: ReadonlyArray<string>,
  booleans: ReadonlyArray<string>,
): FlagSpec => ({
  strings: [...base.strings, ...strings],
  booleans: [...base.booleans, ...booleans],
});

/** Parsed `/mf-references` invocation. Malformed input is `Help` or `Usage`. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'Usage'; readonly message: string }
  | {
      readonly kind: 'Doctor';
      readonly check: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'List';
      readonly status: string | undefined;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | { readonly kind: 'Show'; readonly name: string; readonly dir: string | undefined }
  | {
      readonly kind: 'Verify';
      readonly name: string | undefined;
      readonly all: boolean;
      readonly clones: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Add';
      readonly url: string;
      readonly name: string | undefined;
      readonly ref: string | undefined;
      readonly purpose: string | undefined;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Update';
      readonly target: string | undefined;
      readonly all: boolean;
      readonly force: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Sync';
      readonly name: string | undefined;
      readonly all: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Status';
      readonly name: string | undefined;
      readonly fetch: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Remove';
      readonly name: string;
      readonly keepClone: boolean;
      readonly human: boolean;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    };

interface SplitTokens {
  readonly positionals: readonly string[];
  /** String flags, value verbatim. Boolean flags are never recorded here. */
  readonly flags: Record<string, string>;
  /** Boolean flags, first occurrence wins, exactly like the binary's flag parser. */
  readonly toggles: Record<string, boolean>;
  readonly unknown: readonly string[];
  readonly missingValues: readonly string[];
  readonly invalidValues: ReadonlyArray<{ readonly name: string; readonly value: string }>;
}

/** The boolean spellings the binary's `Flag.boolean` accepts, case-sensitive. */
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on', 'y']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off', 'n']);

/** A boolean literal, or undefined when the token is not one. */
const booleanOf = (value: string): boolean | undefined => {
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return undefined;
};

/**
 * Split raw tokens into positionals and typed flags.
 *
 * Boolean flags mirror the binary: `--flag`, `--no-flag`, `--flag=<literal>`, and
 * a space-separated boolean literal (`--check false`) all set the value, the
 * first occurrence wins, and any other following token stays positional
 * (`verify --clones alpha` keeps `alpha`). A string flag with no value — last,
 * or followed by another flag — is a missing value, never an absent flag.
 * @param tokens - tokens to split
 * @param spec - the verb's accepted flags
 * @returns the split, with any unrecognised or valueless flag names collected
 */
const splitTokens = (tokens: readonly string[], spec: FlagSpec): SplitTokens => {
  const strings = new Set(spec.strings);
  const booleans = new Set(spec.booleans);
  const positionals: Array<string> = [];
  const pairs: Array<[string, string]> = [];
  const toggles: Record<string, boolean> = {};
  const seen = new Set<string>();
  const unknown: Array<string> = [];
  const missingValues: Array<string> = [];
  const invalidValues: Array<{ name: string; value: string }> = [];
  const recordString = (name: string, value: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    pairs.push([name, value]);
  };
  const recordToggle = (name: string, value: boolean): void => {
    if (seen.has(name)) return;
    seen.add(name);
    toggles[name] = value;
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    if (equals > 0) {
      const name = body.slice(0, equals);
      const value = body.slice(equals + 1);
      if (booleans.has(name)) {
        const parsed = booleanOf(value);
        if (parsed === undefined) invalidValues.push({ name: `--${name}`, value });
        else recordToggle(name, parsed);
        continue;
      }
      if (!strings.has(name)) unknown.push(`--${name}`);
      else recordString(name, value);
      continue;
    }
    if (body.startsWith('no-') && booleans.has(body.slice(3))) {
      recordToggle(body.slice(3), false);
      continue;
    }
    if (booleans.has(body)) {
      const next = tokens[index + 1];
      const parsed = next === undefined ? undefined : booleanOf(next);
      if (parsed !== undefined) index++;
      recordToggle(body, parsed ?? true);
      continue;
    }
    if (strings.has(body)) {
      const next = tokens[index + 1];
      if (next === undefined || next.startsWith('--')) {
        missingValues.push(`--${body}`);
        continue;
      }
      recordString(body, next);
      index++;
      continue;
    }
    unknown.push(`--${body}`);
  }
  return {
    positionals,
    flags: Object.fromEntries(pairs),
    toggles,
    unknown,
    missingValues,
    invalidValues,
  };
};

/** Keep the token's value verbatim: only `undefined` means the flag was absent. */
const one = (value: string | undefined): string | undefined => value;

/**
 * Split args on whitespace, keeping `"quoted spans"` together — including an
 * empty quoted token, which is a present empty value, not an omitted flag.
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: Array<string> = [];
  for (const match of args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    const quoted = match[1] ?? match[2];
    tokens.push(quoted ?? match[3] ?? '');
  }
  return tokens;
};

const usage = (message: string): CliAction => ({ kind: 'Usage', message });

const flagProblem = (verb: string, split: SplitTokens): CliAction | undefined => {
  if (split.unknown.length > 0) {
    return usage(
      `usage: unknown flag '${split.unknown[0] ?? ''}' for ${verb}; run '/mf-references help'`,
    );
  }
  const missing = split.missingValues[0];
  if (missing !== undefined) return usage(`usage: missing value for flag '${missing}'`);
  const invalid = split.invalidValues[0];
  return invalid === undefined
    ? undefined
    : usage(`usage: invalid value '${invalid.value}' for flag '${invalid.name}'`);
};

/**
 * Parse raw slash-command args into a {@link CliAction}.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseCliArgs = (args: string): CliAction => {
  const tokens = tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Help' };
  switch (head) {
    case 'doctor': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['check']));
      const bad = flagProblem('doctor', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 0)
        return usage('usage: /mf-references doctor [--check] [--dir path]');
      return {
        kind: 'Doctor',
        check: split.toggles['check'] === true,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'list': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, ['status'], []));
      const bad = flagProblem('list', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 0)
        return usage('usage: /mf-references list [--status installed|missing]');
      return {
        kind: 'List',
        status: one(split.flags['status']),
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'show': {
      const split = splitTokens(tokens.slice(1), { strings: ['dir'], booleans: [] });
      const bad = flagProblem('show', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length !== 1) {
        return usage('usage: /mf-references show <name> [--dir path]');
      }
      return {
        kind: 'Show',
        name: split.positionals[0] ?? '',
        dir: one(split.flags['dir']),
      };
    }
    case 'verify': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['all', 'clones']));
      const bad = flagProblem('verify', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 1) return usage('usage: /mf-references verify [<name>|--all]');
      const name = split.positionals[0];
      const all = split.toggles['all'] === true;
      if (name !== undefined && all) return usage('usage: pass either <name> or --all, not both');
      return {
        kind: 'Verify',
        name,
        all,
        clones: split.toggles['clones'] === true,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'add': {
      const split = splitTokens(
        tokens.slice(1),
        withFlags(OUTPUT_FLAGS, ['name', 'ref', 'purpose'], []),
      );
      const bad = flagProblem('add', split);
      if (bad !== undefined) return bad;
      const url = split.positionals[0];
      if (url === undefined) {
        return usage('usage: /mf-references add <url> [--name slug] [--purpose text]');
      }
      if (split.positionals.length > 1) return usage('usage: /mf-references add <url>');
      return {
        kind: 'Add',
        url,
        name: one(split.flags['name']),
        ref: one(split.flags['ref']),
        purpose: one(split.flags['purpose']),
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'update': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['all', 'force']));
      const bad = flagProblem('update', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 1)
        return usage('usage: /mf-references update <name|url>|--all');
      const target = split.positionals[0];
      const all = split.toggles['all'] === true;
      if (target !== undefined && all)
        return usage('usage: pass either <name|url> or --all, not both');
      if (target === undefined && !all) {
        return usage('usage: /mf-references update <name|url> (or /mf-references update --all)');
      }
      return {
        kind: 'Update',
        target,
        all,
        force: split.toggles['force'] === true,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'sync': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['all']));
      const bad = flagProblem('sync', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 1) return usage('usage: /mf-references sync <name>|--all');
      const name = split.positionals[0];
      const all = split.toggles['all'] === true;
      if (name !== undefined && all) return usage('usage: pass either <name> or --all, not both');
      if (name === undefined && !all) {
        return usage('usage: /mf-references sync <name> (or /mf-references sync --all)');
      }
      return {
        kind: 'Sync',
        name,
        all,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'status': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['fetch']));
      const bad = flagProblem('status', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length > 1) return usage('usage: /mf-references status [<name>]');
      return {
        kind: 'Status',
        name: split.positionals[0],
        fetch: split.toggles['fetch'] === true,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'remove': {
      const split = splitTokens(tokens.slice(1), withFlags(OUTPUT_FLAGS, [], ['keep-clone']));
      const bad = flagProblem('remove', split);
      if (bad !== undefined) return bad;
      if (split.positionals.length !== 1) {
        return usage('usage: /mf-references remove <name> [--keep-clone]');
      }
      return {
        kind: 'Remove',
        name: split.positionals[0] ?? '',
        keepClone: split.toggles['keep-clone'] === true,
        human: split.toggles['human'] === true,
        verbose: split.toggles['verbose'] === true,
        dir: one(split.flags['dir']),
      };
    }
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'Help' };
    default:
      return usage(`usage: unknown command '${head}'; run '/mf-references help'`);
  }
};

/** Notify-only UI: the surface a slash command may use. */
export type CliUi = {
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
};

/** How this front end spells the actions, for the fix-it text it emits. */
const INVOCATION = '/mf-references';

/** Render modes from one parsed action. */
const renderMode = (action: {
  readonly human: boolean;
  readonly verbose: boolean;
}): Renderers.RenderOptions => ({ human: action.human, verbose: action.verbose });

/**
 * Run one parsed args string end to end: parse, execute, render, notify.
 * @param args - raw slash-command args
 * @param ui - notify-only surface
 * @param cwd - project working directory
 * @returns Effect completing once done, failing with a displayable message
 */
export const run = (
  args: string,
  ui: CliUi,
  cwd: string,
): Effect.Effect<void, string, Engines.EngineDeps> => {
  const action = parseCliArgs(args);
  const say = (text: string): Effect.Effect<void> => Effect.sync(() => ui.notify(text, 'info'));
  return Effect.gen(function* () {
    switch (action.kind) {
      case 'Help':
        return yield* say(USAGE);
      case 'Usage': {
        yield* say(action.message);
        return yield* Effect.fail(action.message);
      }
      case 'Doctor': {
        const root = yield* Engines.rootOf({ cwd, dir: action.dir });
        const result = yield* Engines.doctor(root, {
          check: action.check,
          invocation: INVOCATION,
        });
        yield* say(Renderers.doctor(result, renderMode(action)));
        if (!result.healthy) return yield* Effect.fail(Renderers.gate(result, INVOCATION));
        return;
      }
      case 'List': {
        const rows = yield* Engines.list(
          { cwd, dir: action.dir },
          {
            status: action.status,
            invocation: INVOCATION,
          },
        );
        return yield* say(Renderers.list(rows, renderMode(action)));
      }
      case 'Show':
        return yield* say(yield* Engines.show({ cwd, dir: action.dir }, action.name, INVOCATION));
      case 'Verify': {
        const report = yield* Engines.verify(
          { cwd, dir: action.dir },
          {
            name: action.name,
            all: action.all,
            clones: action.clones,
            invocation: INVOCATION,
          },
        );
        yield* say(Renderers.verify(report, renderMode(action)));
        if (report.issueCount > 0) {
          return yield* Effect.fail(`verify failed: ${report.issueCount} issue(s)`);
        }
        return;
      }
      case 'Add': {
        const result = yield* Engines.add({ cwd, dir: action.dir }, action.url, {
          name: action.name,
          ref: action.ref,
          purpose: action.purpose,
          invocation: INVOCATION,
        });
        yield* say(Renderers.added(result, renderMode(action)));
        if (result.kind === 'refused' || result.kind === 'failed') {
          return yield* Effect.fail(result.message);
        }
        if (result.kind === 'routed' && Renderers.updateFailed(result.update)) {
          return yield* Effect.fail(result.update.message);
        }
        return;
      }
      case 'Update': {
        if (action.all) {
          const report = yield* Engines.updateAll(
            { cwd, dir: action.dir },
            {
              force: action.force,
              invocation: INVOCATION,
            },
          );
          yield* say(Renderers.updatedAll(report, renderMode(action)));
          if (report.failed) return yield* Effect.fail(report.summary);
          return;
        }
        if (action.target === undefined)
          return yield* Effect.fail('usage: update requires a target');
        const result = yield* Engines.update({ cwd, dir: action.dir }, action.target, {
          force: action.force,
          invocation: INVOCATION,
        });
        yield* say(Renderers.updated(result, renderMode(action)));
        if (Renderers.updateFailed(result)) return yield* Effect.fail(result.message);
        return;
      }
      case 'Sync': {
        const result = yield* Engines.sync(
          { cwd, dir: action.dir },
          {
            name: action.name,
            all: action.all,
            invocation: INVOCATION,
          },
        );
        if ('kind' in result) {
          yield* say(result.message);
          return yield* Effect.fail(result.message);
        }
        yield* say(Renderers.synced(result, renderMode(action)));
        if (result.failed) return yield* Effect.fail('sync failed');
        return;
      }
      case 'Status': {
        const result = yield* Engines.status(
          { cwd, dir: action.dir },
          {
            name: action.name,
            fetch: action.fetch,
            invocation: INVOCATION,
          },
        );
        if ('kind' in result) {
          yield* say(result.message);
          return yield* Effect.fail(result.message);
        }
        yield* say(Renderers.status(result, renderMode(action)));
        if (result.refused) {
          const failures = result.rows.flatMap((row) =>
            row.failure === undefined ? [] : [row.failure.message],
          );
          return yield* Effect.fail(
            failures.length === 0 ? result.summary : [...failures, result.summary].join('\n'),
          );
        }
        return;
      }
      case 'Remove': {
        const result = yield* Engines.remove({ cwd, dir: action.dir }, action.name, {
          keepClone: action.keepClone,
          invocation: INVOCATION,
        });
        return yield* say(Renderers.removed(result, renderMode(action)));
      }
      default:
        return assertNever(action);
    }
  });
};

/** Compile-time exhaustiveness guard: a new `CliAction` member must gain a case. */
const assertNever = (value: never): never => value;

/** Log a command result where the server host can see it. */
const notify = (message: string): void => {
  Effect.logInfo(message).pipe(Effect.runSync);
};

/**
 * Register `/mf-references` on the server plugin's command port.
 * @param ports - the server seams
 * @returns Effect completing when the command is registered
 */
export const register = (ports: ServerPorts): Effect.Effect<void, never, Scope.Scope> =>
  ports.command.register({
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    execute: (invocation) =>
      run(invocation.prompt.text, { notify }, ports.cwd).pipe(
        Effect.provide(Engines.Live),
        Effect.catch((message) => Effect.sync(() => notify(message))),
      ),
  });
