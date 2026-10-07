import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect } from 'effect';
import * as Doctor from '../doctor/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `/mf-skills` slash-command front end: a hand-rolled parser over the
 * same engines the `mf-skills` binary uses.
 *
 * A bespoke parser rather than `effect/unstable/cli` because a Pi slash
 * command receives a single argument *string*, not an argv array. Everything
 * below the parser is shared; only the tokenizing differs.
 */

/**
 * Slash-command name registered by {@link register}.
 *
 * `mf-skills` — the same name as the binary, because it is the same command.
 * A Pi session runs the headless CLI; the interactive menu is
 * `/mf-skills-tui`.
 */
export const COMMAND_NAME = 'mf-skills';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Run the skills CLI headlessly: doctor, list [--status valid|invalid], show, verify, create, modify, or delete a skill. Store operations accept --dir to target a workspace root other than the working directory. For the interactive menu use /mf-skills-tui.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-skills doctor [--check] | list [--status valid|invalid] [--verbose] | show <name> | verify [name] [--verbose] | create <name> --description "text" [--body "markdown"] [--author a] [--version v] [--license l] [--groups a,b] [--dependencies a,b] [--dir path] | modify <name> [--description ... --body ... --author ... --version ... --license ... --groups ... --dependencies ... --dir path] | delete <name> [--dir path] | help';

/** Flags `doctor` understands. Anything else is usage. */
const KNOWN_DOCTOR_FLAGS: ReadonlySet<string> = new Set(['check']);

/** Flags `list` understands. Anything else is usage. */
const KNOWN_LIST_FLAGS: ReadonlySet<string> = new Set(['status', 'verbose', 'dir']);

/** Flags `create` and `modify` understand. Anything else is usage. */
const KNOWN_EDIT_FLAGS: ReadonlySet<string> = new Set([
  'description',
  'body',
  'author',
  'version',
  'license',
  'groups',
  'dependencies',
  'dir',
]);

/** Parsed `/mf-skills` invocation. Never prompts — gaps fail. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'Doctor'; readonly check: boolean }
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
  | { readonly kind: 'Delete'; readonly name: string; readonly dir: string | undefined };

/** Token split: bare positionals plus `--flag value` / `--flag=value` pairs. */
interface SplitTokens {
  readonly positionals: readonly string[];
  readonly flags: Record<string, string>;
  readonly unknown: readonly string[];
}

/**
 * Split raw tokens into positionals and flags, rejecting flags outside `known`.
 * @param tokens - tokens to split
 * @param known - the only flags this action accepts
 * @returns the split, with any unrecognised flag names collected
 */
const splitTokens = (tokens: readonly string[], known: ReadonlySet<string>): SplitTokens => {
  const positionals: string[] = [];
  const pairs: Array<[string, string]> = [];
  const unknown: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    if (equals > 0) {
      pairs.push([body.slice(0, equals), body.slice(equals + 1)]);
      continue;
    }
    const next = tokens[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      pairs.push([body, next]);
      index++;
    } else {
      pairs.push([body, '']);
    }
  }
  const flags = Object.fromEntries(pairs);
  for (const key of Object.keys(flags)) {
    if (!known.has(key)) unknown.push(`--${key}`);
  }
  return { positionals, flags, unknown };
};

const one = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

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
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: string[] = [];
  for (const match of args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
    const token = match[1] ?? match[2] ?? match[3] ?? '';
    if (token !== '') tokens.push(token);
  }
  return tokens;
};

/**
 * Parse raw slash-command args into a {@link CliAction}. Malformed input is
 * `Help` — the usage line names every supported flag.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseCliArgs = (args: string): CliAction => {
  const tokens = tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Help' };
  switch (head) {
    case 'doctor': {
      const split = splitTokens(tokens.slice(1), KNOWN_DOCTOR_FLAGS);
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Doctor', check: split.flags['check'] !== undefined };
    }
    case 'list': {
      const split = splitTokens(tokens.slice(1), KNOWN_LIST_FLAGS);
      if (split.unknown.length > 0) return { kind: 'Help' };
      return {
        kind: 'List',
        status: one(split.flags['status']),
        verbose: split.flags['verbose'] !== undefined,
        dir: one(split.flags['dir']),
      };
    }
    case 'show': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), new Set(['dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Show', name: tokens[1], dir: one(split.flags['dir']) };
    }
    case 'verify': {
      const positional = tokens[1]?.startsWith('--') === true ? undefined : tokens[1];
      const rest = positional === undefined ? tokens.slice(1) : tokens.slice(2);
      const split = splitTokens(rest, new Set(['verbose', 'dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return {
        kind: 'Verify',
        name: positional,
        verbose: split.flags['verbose'] !== undefined,
        dir: one(split.flags['dir']),
      };
    }
    case 'delete': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), new Set(['dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Delete', name: tokens[1], dir: one(split.flags['dir']) };
    }
    case 'create':
    case 'modify': {
      const split = splitTokens(tokens.slice(1), KNOWN_EDIT_FLAGS);
      const name = split.positionals[0];
      if (name === undefined || split.unknown.length > 0) return { kind: 'Help' };
      const shared = {
        name,
        description: one(split.flags['description']),
        body: one(split.flags['body']),
        author: one(split.flags['author']),
        version: one(split.flags['version']),
        license: one(split.flags['license']),
        groups: csv(split.flags['groups']),
        dependencies: csv(split.flags['dependencies']),
        dir: one(split.flags['dir']),
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
    switch (action.kind) {
      case 'Help':
        return yield* say(USAGE);
      case 'Doctor': {
        const result = yield* Doctor.runDoctor(cwd, {
          check: action.check,
          invocation: '/mf-skills doctor',
        });
        yield* say(Renderers.doctor(result));
        if (!result.healthy) return yield* Effect.fail(Renderers.doctor(result));
        return;
      }
      case 'List': {
        const status = yield* Engines.resolveListStatus(action.status);
        const skills = yield* Engines.list({ cwd, dir: action.dir }, { status });
        return yield* say(
          Renderers.list(skills, { verbose: action.verbose, status: action.status }),
        );
      }
      case 'Show': {
        const raw = yield* Engines.load({ cwd, dir: action.dir }, action.name);
        return yield* say(Renderers.show(raw));
      }
      case 'Verify': {
        const report = yield* Engines.verify({ cwd, dir: action.dir }, action.name);
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
          { cwd, dir: action.dir },
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
          { cwd, dir: action.dir },
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
        yield* Engines.remove({ cwd, dir: action.dir }, action.name);
        return yield* say(Renderers.deleted(action.name));
      }
    }
  });
};

/**
 * Register the `/mf-skills` slash command as an Effect. Failures notify.
 * @param api - Pi extension API
 * @returns Effect completing once the command is registered
 */
export const register = (api: Pick<ExtensionAPI, 'registerCommand'>): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(api, COMMAND_NAME, COMMAND_DESCRIPTION, (args, ctx) =>
    run(args, ctx.ui, ctx.cwd),
  );
