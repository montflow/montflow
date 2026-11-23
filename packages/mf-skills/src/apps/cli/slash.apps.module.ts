import { NodePath } from '@effect/platform-node';
import { Effect, Path } from 'effect';
import * as Doctor from '../doctor/index.js';
import * as Sync from '../sync/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `/mf-skills` slash-command front end: a hand-rolled parser over the
 * same engines the `mf-skills` binary uses.
 *
 * A bespoke parser rather than `effect/cli` because an OpenCode slash
 * command receives a single argument *string*, not an argv array. Everything
 * below the parser is shared; only the tokenizing differs.
 */

/**
 * Slash-command name.
 *
 * `mf-skills` — the same name as the binary, because it is the same command.
 * A session runs the headless CLI; the interactive menu is
 * `/mf-skills`.
 */
export const COMMAND_NAME = 'mf-skills';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Run the skills CLI headlessly: doctor, list [--status valid|invalid], show, verify, create, modify, sync, or delete a skill. Store operations accept --dir to target a workspace root other than the working directory; sync uses --source and --target (--from and --dir stay as aliases). For the interactive menu use /mf-skills.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-skills doctor [--check] [--verbose] [--dir path] | list [--status valid|invalid] [--verbose] [--dir path] | show <name> [--dir path] | verify [name] [--verbose] [--dir path] | create <name> --description "text" [--body "markdown"] [--author a] [--version v] [--license l] [--groups a,b] [--dependencies a,b] [--dir path] | modify <name> [--description ... --body ... --author ... --version ... --license ... --groups ... --dependencies ... --dir path] | delete <name> [--dir path] | sync [--source path] [--target path] [--check] [--verbose] (aliases: --from, --dir) | help';

/** Value flags `create` and `modify` share. Anything else is usage. */
const EDIT_VALUE_FLAGS: ReadonlySet<string> = new Set([
  'description',
  'body',
  'author',
  'version',
  'license',
  'groups',
  'dependencies',
  'dir',
]);

/** How many bare positionals a command accepts. */
interface PositionalArity {
  readonly min: number;
  readonly max: number;
}

/** No bare positional: a stray word is usage like an unknown flag. */
const NO_POSITIONALS: PositionalArity = { min: 0, max: 0 };

/** Exactly one bare positional, the skill name. */
const ONE_POSITIONAL: PositionalArity = { min: 1, max: 1 };

/** `verify` checks one named skill or every skill. */
const OPTIONAL_POSITIONAL: PositionalArity = { min: 0, max: 1 };

/**
 * One command's accepted flags and positionals, mirroring the binary's
 * `Command` tree. Values and booleans are separate because the two consume
 * their argument differently: a bare value flag is malformed, a bare boolean
 * is `true`.
 */
interface FlagGrammar {
  readonly booleans: ReadonlySet<string>;
  readonly values: ReadonlySet<string>;
  readonly positionals: PositionalArity;
}

/** `doctor`: `--check`/`--verbose` switches, `--dir` value, no positional. */
const DOCTOR_GRAMMAR: FlagGrammar = {
  booleans: new Set(['check', 'verbose']),
  values: new Set(['dir']),
  positionals: NO_POSITIONALS,
};

/** `list`: `--verbose` switch, `--status`/`--dir` values, no positional. */
const LIST_GRAMMAR: FlagGrammar = {
  booleans: new Set(['verbose']),
  values: new Set(['status', 'dir']),
  positionals: NO_POSITIONALS,
};

/** `show`: `--dir` value, exactly one name. */
const SHOW_GRAMMAR: FlagGrammar = {
  booleans: new Set(),
  values: new Set(['dir']),
  positionals: ONE_POSITIONAL,
};

/** `verify`: `--verbose` switch, `--dir` value, zero or one name. */
const VERIFY_GRAMMAR: FlagGrammar = {
  booleans: new Set(['verbose']),
  values: new Set(['dir']),
  positionals: OPTIONAL_POSITIONAL,
};

/** `create`/`modify`: every edit flag takes a value, exactly one name. */
const EDIT_GRAMMAR: FlagGrammar = {
  booleans: new Set(),
  values: EDIT_VALUE_FLAGS,
  positionals: ONE_POSITIONAL,
};

/** `delete`: `--dir` value, exactly one name. */
const DELETE_GRAMMAR: FlagGrammar = {
  booleans: new Set(),
  values: new Set(['dir']),
  positionals: ONE_POSITIONAL,
};

/** `sync`: `--check`/`--verbose` switches, `--source`/`--target` and aliases, no positional. */
const SYNC_GRAMMAR: FlagGrammar = {
  booleans: new Set(['check', 'verbose']),
  values: new Set(['source', 'target', 'from', 'dir']),
  positionals: NO_POSITIONALS,
};

/** A malformed invocation's usage, distinct from help the caller asked for. */
const INVALID: CliAction = { kind: 'Help', invalid: true };

/** The exact spellings `effect/cli` accepts for `true`. */
const TRUE_VALUES: ReadonlySet<string> = new Set(['true', 'yes', 'on', '1', 'y']);

/** The exact spellings `effect/cli` accepts for `false`. */
const FALSE_VALUES: ReadonlySet<string> = new Set(['false', 'no', 'off', '0', 'n']);

/**
 * A boolean literal, or undefined when `raw` is not one of the exact tokens
 * `effect/cli` accepts. No case folding: `FALSE` is invalid on both surfaces.
 */
const booleanLiteral = (raw: string): boolean | undefined => {
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return undefined;
};

/**
 * True when `effect/cli`'s lexer reads the token as a flag rather than a
 * value: anything starting with `-` except a bare `-`.
 */
const isFlagToken = (token: string): boolean => token.length > 1 && token.startsWith('-');

/**
 * Split raw tokens into positionals and flags according to `grammar`.
 *
 * Mirrors `effect/cli`'s lexer: any token starting with `-` (except a bare
 * `-`) is a flag token, so a value flag followed by one is missing and a
 * single-dash token the grammar does not know is an unknown flag; `--` ends
 * flag parsing and leaves the rest positional; `--flag=value` always assigns;
 * a boolean flag consumes the next token only when it is one of the exact
 * boolean literals (`--verbose alpha` is a bare `true` plus the positional
 * `alpha`); a value flag consumes the next non-flag token or is missing.
 * Anything outside the grammar is collected for the caller to refuse.
 *
 * Duplicate flags keep the first assignment, matching the binary's argv
 * parser (`--dir a --dir b` targets `a`).
 */
const splitTokens = (tokens: readonly string[], grammar: FlagGrammar): SplitTokens => {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const booleans: Record<string, boolean> = {};
  const missing: string[] = [];
  const invalid: string[] = [];
  const unknown: string[] = [];
  let terminated = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (terminated) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      terminated = true;
      continue;
    }
    if (!token.startsWith('--')) {
      // A single-dash token is a flag the grammar does not define; a bare `-`
      // and anything else stay values.
      if (isFlagToken(token)) unknown.push(token);
      else positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    const name = equals === -1 ? body : body.slice(0, equals);
    const inline = equals === -1 ? undefined : body.slice(equals + 1);

    if (grammar.booleans.has(name)) {
      if (inline !== undefined) {
        const parsed = booleanLiteral(inline);
        if (parsed === undefined) invalid.push(name);
        else if (!(name in booleans)) booleans[name] = parsed;
        continue;
      }
      const next = tokens[index + 1];
      const literal = next === undefined ? undefined : booleanLiteral(next);
      if (literal !== undefined) {
        if (!(name in booleans)) booleans[name] = literal;
        index++;
      } else if (!(name in booleans)) {
        booleans[name] = true;
      }
      continue;
    }

    if (!grammar.values.has(name)) {
      unknown.push(`--${name}`);
      continue;
    }

    if (inline !== undefined) {
      if (!(name in values)) values[name] = inline;
      continue;
    }
    const next = tokens[index + 1];
    if (next !== undefined && !isFlagToken(next)) {
      if (!(name in values)) values[name] = next;
      index++;
    } else {
      missing.push(name);
    }
  }

  return { positionals, values, booleans, missing, invalid, unknown };
};

/**
 * True when a split breaks the grammar: an unknown flag, a value flag without
 * a value, an invalid boolean value, or the wrong number of positionals.
 */
const isMalformed = (split: SplitTokens, grammar: FlagGrammar): boolean =>
  split.unknown.length > 0 ||
  split.missing.length > 0 ||
  split.invalid.length > 0 ||
  split.positionals.length < grammar.positionals.min ||
  split.positionals.length > grammar.positionals.max;

/**
 * Token split: bare positionals, value flags, and boolean flags.
 * `missing` and `invalid` distinguish a bare value flag and a bad boolean
 * value from a flag that was simply absent.
 */
interface SplitTokens {
  readonly positionals: readonly string[];
  /** Value flags that received a value; empty string is a real value. */
  readonly values: Record<string, string>;
  /** Boolean flags that were supplied, with their parsed value. */
  readonly booleans: Record<string, boolean>;
  /** Value flags supplied with no value (`Missing value for flag`). */
  readonly missing: readonly string[];
  /** Boolean flags supplied with a value outside the accepted set. */
  readonly invalid: readonly string[];
  readonly unknown: readonly string[];
}

const one = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

/** Parsed `/mf-skills` invocation. Never prompts — gaps fail. */
export type CliAction =
  /**
   * Usage. `invalid` marks malformed input — a typo the caller must fix — so
   * `run` can fail instead of reporting success; a bare or unknown command is
   * help the caller asked for and stays successful.
   */
  | { readonly kind: 'Help'; readonly invalid?: boolean }
  | { readonly kind: 'Doctor'; readonly check: boolean; readonly dir: string | undefined }
  | {
      readonly kind: 'List';
      readonly status: string | undefined;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | { readonly kind: 'Show'; readonly name: string; readonly dir: string | undefined }
  | {
      readonly kind: 'Verify';
      readonly name: string | undefined;
      readonly verbose: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Create';
      readonly name: string;
      readonly description: string | undefined;
      readonly body: string | undefined;
      readonly author: string | undefined;
      readonly version: string | undefined;
      readonly license: string | undefined;
      readonly groups: ReadonlyArray<string> | undefined;
      readonly dependencies: ReadonlyArray<string> | undefined;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Modify';
      readonly name: string;
      readonly description: string | undefined;
      readonly body: string | undefined;
      readonly author: string | undefined;
      readonly version: string | undefined;
      readonly license: string | undefined;
      readonly groups: ReadonlyArray<string> | undefined;
      readonly dependencies: ReadonlyArray<string> | undefined;
      readonly dir: string | undefined;
    }
  | { readonly kind: 'Delete'; readonly name: string; readonly dir: string | undefined }
  | {
      readonly kind: 'Sync';
      /** Canonical `--source`; `--from` is the alias folded into it. */
      readonly source: string | undefined;
      /** Canonical `--target`; `--dir` is the alias folded into it. */
      readonly target: string | undefined;
      readonly check: boolean;
      readonly verbose: boolean;
    };

const csv = (value: string | undefined): ReadonlyArray<string> | undefined => {
  if (value === undefined || value === '') return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : undefined;
};

/**
 * Split args on whitespace, keeping `"quoted spans"` together.
 *
 * Empty quotes are tokens: `--description ""` passes the empty string, which
 * is a real value to `effect/cli`, not a missing one. Only whitespace between
 * tokens produces no token at all.
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: string[] = [];
  for (const match of args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    // A quoted group is pushed even when empty; `\S+` never matches empty.
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
};

/**
 * Parse raw slash-command args into a {@link CliAction}. Malformed input is
 * `Help` — marked `invalid` when a known command's flags or positionals break
 * its grammar, so `run` can fail it — and left plain when the caller asked for
 * help.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseCliArgs = (args: string): CliAction => {
  const tokens = tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Help' };

  /** The command's split, or undefined when it breaks that command's grammar. */
  const splitFor = (grammar: FlagGrammar): SplitTokens | undefined => {
    const split = splitTokens(tokens.slice(1), grammar);
    return isMalformed(split, grammar) ? undefined : split;
  };

  switch (head) {
    case 'doctor': {
      const split = splitFor(DOCTOR_GRAMMAR);
      if (split === undefined) return INVALID;
      return {
        kind: 'Doctor',
        check: split.booleans['check'] ?? false,
        dir: one(split.values['dir']),
      };
    }
    case 'sync': {
      const split = splitFor(SYNC_GRAMMAR);
      if (split === undefined) return INVALID;
      return {
        kind: 'Sync',
        // Canonical wins when both names are supplied. An empty canonical
        // value is absent, matching the binary and the engine.
        source: one(split.values['source']) ?? one(split.values['from']),
        target: one(split.values['target']) ?? one(split.values['dir']),
        check: split.booleans['check'] ?? false,
        verbose: split.booleans['verbose'] ?? false,
      };
    }
    case 'list': {
      const split = splitFor(LIST_GRAMMAR);
      if (split === undefined) return INVALID;
      return {
        kind: 'List',
        status: one(split.values['status']),
        verbose: split.booleans['verbose'] ?? false,
        dir: one(split.values['dir']),
      };
    }
    case 'show': {
      const split = splitFor(SHOW_GRAMMAR);
      const name = split?.positionals[0];
      if (split === undefined || name === undefined) return INVALID;
      return { kind: 'Show', name, dir: one(split.values['dir']) };
    }
    case 'verify': {
      const split = splitFor(VERIFY_GRAMMAR);
      if (split === undefined) return INVALID;
      return {
        kind: 'Verify',
        name: split.positionals[0],
        verbose: split.booleans['verbose'] ?? false,
        dir: one(split.values['dir']),
      };
    }
    case 'delete': {
      const split = splitFor(DELETE_GRAMMAR);
      const name = split?.positionals[0];
      if (split === undefined || name === undefined) return INVALID;
      return { kind: 'Delete', name, dir: one(split.values['dir']) };
    }
    case 'create':
    case 'modify': {
      const split = splitFor(EDIT_GRAMMAR);
      const name = split?.positionals[0];
      if (split === undefined || name === undefined) return INVALID;
      const shared = {
        name,
        // Text flags keep an empty quoted value: `--description ""` is a real
        // (empty) description to the binary, not a missing flag.
        description: split.values['description'],
        body: split.values['body'],
        author: split.values['author'],
        version: split.values['version'],
        license: split.values['license'],
        groups: csv(split.values['groups']),
        dependencies: csv(split.values['dependencies']),
        dir: one(split.values['dir']),
      };
      return head === 'create' ? { kind: 'Create', ...shared } : { kind: 'Modify', ...shared };
    }
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'Help' };
    default:
      return { kind: 'Help' };
  }
};

/** Notify-only UI: the surface a slash command may use. */
export type CliUi = {
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
};

/**
 * Run one parsed args string end to end: parse, load, execute, render, notify.
 * Never opens a dialog — a missing input fails with a message an agent can act
 * on, which is the whole point of a headless surface.
 * @param args - raw slash-command args
 * @param ui - notify-only surface
 * @param cwd - project working directory
 * @returns Effect completing once done, failing with a displayable message
 */
export const run = (args: string, ui: CliUi, cwd: string): Effect.Effect<void, string> => {
  const action = parseCliArgs(args);
  const say = (text: string): Effect.Effect<void> => Effect.sync(() => ui.notify(text, 'info'));
  return Effect.gen(function* () {
    // Resolve every path flag once, against the session directory. A relative
    // `--dir .`, `--source .`, or `--target .` must never fall through to
    // `process.cwd()`: the engines hand a relative path straight to node fs, so
    // the host process's launch directory would be read and written instead of
    // the session's.
    const paths = yield* Effect.gen(function* () {
      const path = yield* Path.Path;
      const resolvePath = (value: string | undefined): string | undefined =>
        value === undefined ? undefined : path.resolve(cwd, value);
      if (action.kind === 'Sync') {
        return {
          dir: undefined,
          source: resolvePath(action.source),
          target: resolvePath(action.target),
        };
      }
      return {
        dir: action.kind === 'Help' ? undefined : resolvePath(action.dir),
        source: undefined,
        target: undefined,
      };
    }).pipe(Effect.provide(NodePath.layer));

    switch (action.kind) {
      case 'Help':
        // Malformed flags are a failed command, not a request for help: a
        // slash command that notifies usage and returns success lets an agent
        // believe it synced. A bare or unknown command stays a successful
        // usage report.
        if (action.invalid === true) return yield* Effect.fail(USAGE);
        return yield* say(USAGE);
      case 'Doctor': {
        const result = yield* Doctor.runDoctor(paths.dir ?? cwd, {
          check: action.check,
          invocation: '/mf-skills doctor',
        });
        yield* say(Renderers.doctor(result));
        if (!result.healthy) return yield* Effect.fail(Renderers.doctor(result));
        return;
      }
      case 'Sync': {
        const result = yield* Sync.runSync({
          from: paths.source,
          // An absent `--target` means the session directory, as it does for
          // every other store command.
          dir: paths.target ?? cwd,
          check: action.check,
          cwd,
          invocation: '/mf-skills sync',
        });
        // Notified once here; the failure below names the fix rather than
        // repeating the report, so the reader does not read it twice.
        yield* say(Renderers.sync(result, { verbose: action.verbose }));
        if (result.check && result.drifted) {
          return yield* Effect.fail(Renderers.syncRefusal(result));
        }
        return;
      }
      case 'List': {
        const status = yield* Engines.resolveListStatus(action.status);
        const skills = yield* Engines.list({ cwd, dir: paths.dir }, { status });
        return yield* say(
          Renderers.list(skills, { verbose: action.verbose, status: action.status }),
        );
      }
      case 'Show': {
        const raw = yield* Engines.load({ cwd, dir: paths.dir }, action.name);
        return yield* say(Renderers.show(raw));
      }
      case 'Verify': {
        const report = yield* Engines.verify({ cwd, dir: paths.dir }, action.name);
        yield* say(Renderers.verify(report, { verbose: action.verbose }));
        if (!report.valid) {
          return yield* Effect.fail(`Verification failed:\n${Renderers.verify(report)}`);
        }
        return;
      }
      case 'Create': {
        if (action.description === undefined) {
          return yield* Effect.fail('create requires --description "text".');
        }
        const skill = yield* Engines.create(
          { cwd, dir: paths.dir },
          {
            name: action.name,
            description: action.description,
            body: action.body ?? '',
            author: action.author,
            version: action.version,
            license: action.license,
            groups: action.groups ?? [],
            dependencies: action.dependencies ?? [],
          },
        );
        return yield* say(Renderers.created(skill));
      }
      case 'Modify': {
        const skill = yield* Engines.modify(
          { cwd, dir: paths.dir },
          {
            name: action.name,
            description: action.description,
            body: action.body,
            author: action.author,
            version: action.version,
            license: action.license,
            groups: action.groups,
            dependencies: action.dependencies,
          },
        );
        return yield* say(Renderers.saved(skill));
      }
      case 'Delete': {
        yield* Engines.remove({ cwd, dir: paths.dir }, action.name);
        return yield* say(Renderers.deleted(action.name));
      }
    }
  });
};
