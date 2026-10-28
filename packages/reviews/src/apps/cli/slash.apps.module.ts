import { Effect } from 'effect';
import type { ProfileStore } from '@montflow/profiles/services';
import type { SpecStore } from '@montflow/specs/services';
import { ProfileProbe, ReviewStore } from '../../services/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `/mf-reviews` slash-command front end: a hand-rolled parser over the
 * same engines the `mf-reviews` binary uses.
 *
 * A bespoke parser rather than `effect/cli` because a OpenCode slash command
 * receives a single argument *string*, not an argv array, so the bin's
 * `Command` tree cannot be reused here. Everything below the parser is shared.
 */

/** Slash-command name. */
export const COMMAND_NAME = 'mf-reviews';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Run the reviews CLI headlessly: doctor [--check], list, show <name> [--round NNN], verify [<name>|--all], create <name> [--target t] [--profile p] [--round NNN], resume <name>, or new <name> (alias of create). Store operations accept --dir to target a workspace root other than the working directory.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-reviews doctor [--check] | list | show <name> [--round NNN] | verify [<name>|--all] [--dir path] | create <name> [--target t] [--profile p] [--round NNN] [--dir path] | resume <name> [--dir path] | new <name> (alias of create) | help';

/** Parsed `/mf-reviews` invocation. Malformed input is `Help`. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'Doctor'; readonly check: boolean }
  | { readonly kind: 'List' }
  | { readonly kind: 'Show'; readonly name: string; readonly round: string | undefined }
  | {
      readonly kind: 'Verify';
      readonly name: string | undefined;
      readonly all: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Create';
      readonly name: string;
      readonly target: string | undefined;
      readonly profile: string | undefined;
      readonly round: string | undefined;
      readonly dir: string | undefined;
    }
  | { readonly kind: 'Resume'; readonly name: string; readonly dir: string | undefined };

interface SplitTokens {
  readonly positionals: readonly string[];
  readonly flags: Record<string, string>;
  readonly unknown: readonly string[];
}

/** Split raw tokens into positionals and flags, rejecting flags outside `known`. */
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
      const split = splitTokens(tokens.slice(1), new Set(['check']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Doctor', check: split.flags['check'] !== undefined };
    }
    case 'list': {
      const split = splitTokens(tokens.slice(1), new Set());
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'List' };
    }
    case 'show': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), new Set(['round']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Show', name: tokens[1], round: one(split.flags['round']) };
    }
    case 'verify': {
      const split = splitTokens(tokens.slice(1), new Set(['all', 'dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      const name = split.positionals[0];
      return {
        kind: 'Verify',
        name,
        all: split.flags['all'] !== undefined || name === undefined,
        dir: one(split.flags['dir']),
      };
    }
    case 'create':
    case 'new': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), new Set(['target', 'profile', 'round', 'dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return {
        kind: 'Create',
        name: tokens[1],
        target: one(split.flags['target']),
        profile: one(split.flags['profile']),
        round: one(split.flags['round']),
        dir: one(split.flags['dir']),
      };
    }
    case 'resume': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), new Set(['dir']));
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Resume', name: tokens[1], dir: one(split.flags['dir']) };
    }
    default:
      return { kind: 'Help' };
  }
};

/** Notify-only UI: the surface a slash command may use. */
export type CliUi = {
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
};

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
): Effect.Effect<
  void,
  string,
  | ReviewStore.ReviewStore
  | ProfileProbe.ProfileProbe
  | SpecStore.SpecStore
  | ProfileStore.ProfileStore
> => {
  const action = parseCliArgs(args);
  const say = (text: string): Effect.Effect<void> => Effect.sync(() => ui.notify(text, 'info'));
  return Effect.gen(function* () {
    switch (action.kind) {
      case 'Help':
        return yield* say(USAGE);
      case 'Doctor': {
        const result = yield* Engines.doctor(cwd, action.check);
        yield* say(Renderers.doctor(result));
        if (!result.healthy) return yield* Effect.fail(Renderers.gate(result));
        return;
      }
      case 'List': {
        const series = yield* Engines.list({ cwd });
        return yield* say(Renderers.list(series));
      }
      case 'Show':
        return yield* say(yield* Engines.show({ cwd }, action.name, action.round));
      case 'Verify': {
        if (action.all || action.name === undefined) {
          const report = yield* Engines.verifyAll({ cwd: action.dir ?? cwd });
          const rendered = Renderers.verifyAll(report);
          if (report.issueCount > 0) {
            return yield* Effect.fail(`verification failed:\n${rendered}`);
          }
          yield* say(rendered);
          return;
        }
        const report = yield* Engines.verifySeries({ cwd: action.dir ?? cwd }, action.name);
        yield* say(Renderers.verify(report));
        if (report.entries.some((entry) => !entry.result.valid)) {
          return yield* Effect.fail(
            `'${action.name}' failed verification:\n${Renderers.verify(report)}`,
          );
        }
        return;
      }
      case 'Create': {
        const result = yield* Engines.scaffold({
          cwd: action.dir ?? cwd,
          name: action.name,
          target: action.target,
          round: action.round,
          profile: action.profile,
        });
        return yield* say(Renderers.created(result));
      }
      case 'Resume': {
        const result = yield* Engines.resume({ cwd: action.dir ?? cwd }, action.name);
        return yield* say(Renderers.resumed(result));
      }
    }
  });
};
