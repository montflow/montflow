import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as Prompts from '../../modules/prompts/index.js';
import { PromptStore } from '../../services/index.js';
import * as Interactive from '../interactive/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-prompts-cli`). */
export const COMMAND_NAME = 'mf-prompts-cli';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Manage prompt templates non-interactively: list, create, show, modify, or render a prompt.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-prompts-cli list | show <name> | render <name> [key=value ...] | create <name> --template "text" [--description d] [--model p/m] [--skills a,b] [--variables a,b] | modify <name> [--template "text" ...] | delete <name> | help';

/** Optional fields for `create` / `modify`. Absent means default (create) or keep (modify). */
export interface CliFields {
  readonly template: string | undefined;
  readonly description: string | undefined;
  readonly model: string | undefined;
  readonly skills: readonly string[] | undefined;
  readonly variables: readonly string[] | undefined;
}

/** Parsed `/mf-prompts-cli` invocation. Never prompts — gaps fail. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'List' }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Render'; readonly name: string; readonly values: Record<string, string> }
  | { readonly kind: 'Create'; readonly name: string; readonly fields: CliFields }
  | { readonly kind: 'Modify'; readonly name: string; readonly fields: CliFields }
  | { readonly kind: 'Delete'; readonly name: string };

/** Flags this CLI understands on `create` / `modify`. Anything else is usage. */
const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'template',
  'description',
  'model',
  'skills',
  'variables',
]);

/** Token split: bare positionals plus `--flag value` / `--flag=value` pairs. */
interface SplitTokens {
  readonly positionals: readonly string[];
  readonly flags: Record<string, string>;
  readonly unknown: readonly string[];
}

const splitTokens = (tokens: readonly string[]): SplitTokens => {
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
    if (!KNOWN_FLAGS.has(key)) unknown.push(`--${key}`);
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

const fieldsOf = (split: SplitTokens): CliFields => ({
  template: one(split.flags['template']),
  description: one(split.flags['description']),
  model: one(split.flags['model']),
  skills: csv(split.flags['skills']),
  variables: csv(split.flags['variables']),
});

/**
 * Parse raw slash-command args into a {@link CliAction}. Malformed input is
 * `Help` — the usage line names every supported flag.
 * @param args - raw slash-command args
 * @returns the parsed action
 */
export const parseCliArgs = (args: string): CliAction => {
  const tokens = Interactive.tokenize(args);
  const head = tokens[0];
  if (head === undefined) return { kind: 'Help' };
  switch (head) {
    case 'list':
      return { kind: 'List' };
    case 'show':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Show', name: tokens[1] };
    case 'delete':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Delete', name: tokens[1] };
    case 'render':
      return tokens[1] === undefined
        ? { kind: 'Help' }
        : { kind: 'Render', name: tokens[1], values: Interactive.collectValues(tokens.slice(2)) };
    case 'create':
    case 'modify': {
      const split = splitTokens(tokens.slice(1));
      const name = split.positionals[0];
      if (name === undefined || split.unknown.length > 0) return { kind: 'Help' };
      return { kind: head === 'create' ? 'Create' : 'Modify', name, fields: fieldsOf(split) };
    }
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'Help' };
    default:
      return { kind: 'Help' };
  }
};

const findOrFail = (
  prompts: readonly Prompts.Prompt[],
  name: string,
): Effect.Effect<Prompts.Prompt, string> => {
  const prompt = prompts.find((candidate) => candidate.name === name);
  return prompt === undefined ? Effect.fail(`Unknown prompt '${name}'.`) : Effect.succeed(prompt);
};

/**
 * Run one parsed args string end to end: parse, load, execute, save, notify.
 * Never opens a dialog — missing input fails with a message.
 * @param args - raw slash-command args
 * @param ui - Pi ui surface (notify only; dialogs never called)
 * @param cwd - project working directory
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  ui: Interactive.InteractiveUi,
  cwd: string,
): Effect.Effect<void, string, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    const store = yield* PromptStore.PromptStore;
    const action = parseCliArgs(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'List': {
        yield* store
          .list(cwd)
          .pipe(Effect.flatMap((prompts) => Interactive.listPrompts(ui, prompts)));
        return;
      }
      case 'Show': {
        const prompts = yield* store.list(cwd);
        yield* Interactive.showPrompt(ui, prompts, action.name);
        return;
      }
      case 'Create': {
        if (action.fields.template === undefined) {
          return yield* Effect.fail('create requires --template "text".');
        }
        const prompt = Prompts.make(
          action.name,
          action.fields.template,
          action.fields.description ?? '',
          action.fields.model ?? '',
          action.fields.variables ?? Interactive.variables(action.fields.template),
          action.fields.skills ?? [],
        );
        yield* store.save(cwd, prompt).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${prompt.name}'.`, 'info'));
        return;
      }
      case 'Modify': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        const template = action.fields.template ?? prompt.template;
        if (template.trim() === '') return yield* Effect.fail('Template must not be empty.');
        const updated = Prompts.Prompt.make({
          ...prompt,
          template,
          description: action.fields.description ?? prompt.description,
          model: action.fields.model ?? prompt.model,
          variables: [...(action.fields.variables ?? prompt.variables)],
          skills: [...(action.fields.skills ?? prompt.skills)],
        });
        yield* store.save(cwd, updated).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved prompt '${updated.name}'.`, 'info'));
        return;
      }
      case 'Render': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        const missing = Interactive.variables(prompt.template).filter((name) => {
          const value = action.values[name];
          return value === undefined || value === '';
        });
        if (missing.length > 0) {
          return yield* Effect.fail(`Missing values for: ${missing.join(', ')}.`);
        }
        const rendered = yield* Prompts.renderPrompt(prompt, action.values);
        yield* Effect.sync(() => ui.notify(rendered, 'info'));
        return;
      }
      case 'Delete': {
        const prompts = yield* store.list(cwd);
        const prompt = yield* findOrFail(prompts, action.name);
        yield* store.remove(cwd, prompt.name).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Deleted prompt '${prompt.name}'.`, 'info'));
        return;
      }
    }
  });

/**
 * Register the `/mf-prompts-cli` slash command as an Effect. Failures notify.
 * @param api - Pi extension API
 * @param live - store layer provided to the handler at invocation
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<PromptStore.PromptStore>,
): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(api, COMMAND_NAME, COMMAND_DESCRIPTION, (args, ctx) =>
    run(args, ctx.ui, ctx.cwd).pipe(Effect.provide(live)),
  );
