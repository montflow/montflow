import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as PromptExecute from '../../modules/prompt-execute/index.js';
import { PromptStore } from '../../services/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

/**
 * The `/mf-prompts` slash-command front end: a hand-rolled parser over the
 * same engines the `mf-prompts` binary uses.
 *
 * A bespoke parser rather than `effect/unstable/cli` for one reason — a Pi
 * slash command receives a single argument *string*, not an argv array, so the
 * bin's `Command` tree cannot be reused here. Everything below the parser is
 * shared; only the tokenizing differs, which is exactly the seam worth
 * isolating.
 */

/**
 * Slash-command name registered by {@link register}.
 *
 * `mf-prompts` — the same name as the binary, because it is the same command.
 * A Pi session runs the headless CLI; the interactive menu is
 * `/mf-prompts-tui`. Splitting them the other way round (CLI as
 * `mf-prompts-cli`) put a suffix on the thing people actually reach for and
 * left the menu holding the plain name.
 */
export const COMMAND_NAME = 'mf-prompts';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Run the prompts CLI headlessly: doctor, list, inspect, execute, show, verify, render, create, modify, or delete a prompt. Store operations accept --dir to target a folder other than the default. For the interactive menu use /mf-prompts-tui.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-prompts doctor [--check] | list | inspect <name> [key=value ...] | execute <name> --model p/m [key=value ...] | show <name> | verify <name> | render <name> [key=value ...] | create <name> --template "text" [--description d] [--model p/m] [--skills a,b] [--variable name[:flags]] [--dir path] | modify <name> [--template "text" ...] [--dir path] | delete <name> | help';

/** Flags `execute` and `doctor` understand. Anything else is usage. */
const KNOWN_RUN_FLAGS: ReadonlySet<string> = new Set(['model', 'check']);

/** Flags `create` and `modify` understand. Anything else is usage. */
const KNOWN_EDIT_FLAGS: ReadonlySet<string> = new Set([
  'template',
  'description',
  'model',
  'skills',
  'variable',
  'dir',
]);

/** Parsed `/mf-prompts` invocation. Never prompts — gaps fail. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'Doctor'; readonly check: boolean }
  | { readonly kind: 'List' }
  | {
      readonly kind: 'Inspect';
      readonly name: string;
      readonly values: Record<string, string>;
    }
  | {
      readonly kind: 'Execute';
      readonly name: string;
      readonly model: string | undefined;
      readonly values: Record<string, string>;
    }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Verify'; readonly name: string }
  | { readonly kind: 'Render'; readonly name: string; readonly values: Record<string, string> }
  | {
      readonly kind: 'Create';
      readonly name: string;
      readonly template: string;
      readonly description: string | undefined;
      readonly model: string | undefined;
      readonly skills: readonly string[] | undefined;
      readonly variables: readonly string[] | undefined;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'Modify';
      readonly name: string;
      readonly template: string | undefined;
      readonly description: string | undefined;
      readonly model: string | undefined;
      readonly skills: readonly string[] | undefined;
      readonly variables: readonly string[] | undefined;
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

const csv = (value: string | undefined): readonly string[] | undefined => {
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
      const split = splitTokens(tokens.slice(1), KNOWN_RUN_FLAGS);
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'Doctor', check: split.flags['check'] !== undefined };
    }
    case 'list':
      return { kind: 'List' };
    case 'inspect':
      return tokens[1] === undefined
        ? { kind: 'Help' }
        : { kind: 'Inspect', name: tokens[1], values: Engines.keyValues(tokens.slice(2)) };
    case 'execute': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), KNOWN_RUN_FLAGS);
      if (split.unknown.length > 0) return { kind: 'Help' };
      return {
        kind: 'Execute',
        name: tokens[1],
        model: one(split.flags['model']),
        values: Engines.keyValues(split.positionals),
      };
    }
    case 'show':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Show', name: tokens[1] };
    case 'verify':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Verify', name: tokens[1] };
    case 'render':
      return tokens[1] === undefined
        ? { kind: 'Help' }
        : { kind: 'Render', name: tokens[1], values: Engines.keyValues(tokens.slice(2)) };
    case 'delete': {
      if (tokens[1] === undefined) return { kind: 'Help' };
      const split = splitTokens(tokens.slice(2), KNOWN_EDIT_FLAGS);
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
        model: one(split.flags['model']),
        skills: csv(split.flags['skills']),
        variables: csv(split.flags['variable']),
        dir: one(split.flags['dir']),
      };
      return head === 'create'
        ? { kind: 'Create', template: one(split.flags['template']) ?? '', ...shared }
        : { kind: 'Modify', template: one(split.flags['template']), ...shared };
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
 * @param execute - port that runs an agent on a resolved execution
 * @returns Effect completing once done, failing with a displayable message
 */
export const run = (
  args: string,
  ui: CliUi,
  cwd: string,
  execute: PromptExecute.PromptExecutor,
): Effect.Effect<void, string, PromptStore.PromptStore> => {
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
      case 'List':
        return yield* Engines.list({ cwd }).pipe(
          Effect.flatMap((prompts) => say(Renderers.list(prompts))),
        );
      case 'Inspect': {
        const found = yield* Engines.inspect({ cwd }, action.name, action.values);
        return yield* say(Renderers.inspect(found.summary));
      }
      case 'Execute': {
        const resolved = yield* Engines.plan(
          {
            cwd,
            model: action.model,
            values: action.values,
            invocation: '/mf-prompts execute',
          },
          action.name,
        );
        if (!resolved.ok) return yield* Effect.fail(resolved.message);
        const reply = yield* execute({
          cwd,
          name: action.name,
          model: resolved.model,
          text: resolved.text,
          skills: resolved.skills,
        });
        return yield* say(reply);
      }
      case 'Show': {
        const prompt = yield* Engines.load({ cwd }, action.name);
        return yield* say(Renderers.show(prompt));
      }
      case 'Verify': {
        const result = yield* Engines.verify({ cwd }, action.name);
        yield* say(Renderers.verify(action.name, result));
        if (!result.valid) {
          return yield* Effect.fail(
            `'${action.name}' failed verification:\n${Renderers.verify(action.name, result)}`,
          );
        }
        return;
      }
      case 'Create': {
        const prompt = yield* Engines.create({
          cwd,
          name: action.name,
          template: action.template,
          description: action.description,
          model: action.model,
          skills: action.skills,
          variables: action.variables,
          dir: action.dir,
        });
        return yield* say(Renderers.created(prompt));
      }
      case 'Modify': {
        const prompt = yield* Engines.modify({
          cwd,
          name: action.name,
          template: action.template,
          description: action.description,
          model: action.model,
          skills: action.skills,
          variables: action.variables,
          dir: action.dir,
        });
        return yield* say(Renderers.saved(prompt));
      }
      case 'Render':
        return yield* say(yield* Engines.render({ cwd }, action.name, action.values));
      case 'Delete': {
        yield* Engines.remove({ cwd, dir: action.dir }, action.name);
        return yield* say(Renderers.deleted(action.name));
      }
    }
  });
};

/**
 * Register the `/mf-prompts` slash command as an Effect. Failures notify.
 * @param api - Pi extension API
 * @param live - store layer provided to the handler at invocation
 * @param executeFor - port that runs an agent on a resolved execution
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<PromptStore.PromptStore>,
  executeFor: (cwd: string) => PromptExecute.PromptExecutor,
): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(api, COMMAND_NAME, COMMAND_DESCRIPTION, (args, ctx) =>
    run(args, ctx.ui, ctx.cwd, executeFor(ctx.cwd)).pipe(Effect.provide(live)),
  );
