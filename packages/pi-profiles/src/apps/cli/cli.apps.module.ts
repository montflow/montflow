import { PiEffect } from '@montflow/pi-effect';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Effect, Layer } from 'effect';
import * as PiProfiles from '../../modules/pi-profiles/index.js';
import { ProfileStore } from '../../services/index.js';
import * as Interactive from '../interactive/index.js';

/** Slash-command name registered by {@link register} (invoke as `/mf-profiles-cli`). */
export const COMMAND_NAME = 'mf-profiles-cli';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Manage agent profiles non-interactively: list, create, show, modify, or delete a profile.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-profiles-cli list | show <name> | verify <name> | create <name> --description "text" [--model p/m] [--skills a,b] [--instructions "text"] [--checklist "item 1; item 2"] | modify <name> [--description ...] [--model ...] [--skills ...] [--instructions ...] [--checklist ...] | delete <name> | help';

/** Optional fields for `create` / `modify`. Absent means default (create) or keep (modify). */
export interface CliFields {
  readonly description: string | undefined;
  readonly model: string | undefined;
  readonly skills: readonly string[] | undefined;
  readonly instructions: string | undefined;
  readonly checklist: readonly string[] | undefined;
}

/** Parsed `/mf-profiles-cli` invocation. Never prompts — gaps fail. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'List' }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Verify'; readonly name: string }
  | { readonly kind: 'Create'; readonly name: string; readonly fields: CliFields }
  | { readonly kind: 'Modify'; readonly name: string; readonly fields: CliFields }
  | { readonly kind: 'Delete'; readonly name: string };

/** Flags this CLI understands on `create` / `modify`. Anything else is usage. */
const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'description',
  'model',
  'skills',
  'instructions',
  'checklist',
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

/** Comma-separated skill names. Blank or absent reads as undefined. */
const csv = (value: string | undefined): readonly string[] | undefined => {
  if (value === undefined || value === '') return undefined;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : undefined;
};

/**
 * Semicolon-separated checklist items. Semicolons (not commas) split so
 * items can carry commas. Blank or absent reads as undefined.
 * @param value - raw `--checklist` value
 * @returns non-blank items, if any
 */
const checklistOf = (value: string | undefined): readonly string[] | undefined => {
  if (value === undefined || value === '') return undefined;
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : undefined;
};

const fieldsOf = (split: SplitTokens): CliFields => ({
  description: one(split.flags['description']),
  model: one(split.flags['model']),
  skills: csv(split.flags['skills']),
  instructions: one(split.flags['instructions']),
  checklist: checklistOf(split.flags['checklist']),
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
    case 'verify':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Verify', name: tokens[1] };
    case 'delete':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Delete', name: tokens[1] };
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
  profiles: readonly PiProfiles.Profile[],
  name: string,
): Effect.Effect<PiProfiles.Profile, string> => {
  const profile = profiles.find((candidate) => candidate.name === name);
  return profile === undefined
    ? Effect.fail(`Unknown profile '${name}'.`)
    : Effect.succeed(profile);
};

/**
 * Run one parsed args string end to end: parse, load, execute, save, notify.
 * Never opens a dialog — missing input fails with a message. No agentic
 * workflows: every field comes from flags, so agents and scripts can
 * drive it mechanically.
 * @param args - raw slash-command args
 * @param ui - Pi ui surface (notify only; dialogs never called)
 * @param cwd - project working directory
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  ui: Interactive.InteractiveUi,
  cwd: string,
): Effect.Effect<void, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const action = parseCliArgs(args);
    switch (action.kind) {
      case 'Help': {
        yield* Effect.sync(() => ui.notify(USAGE, 'info'));
        return;
      }
      case 'List': {
        yield* store
          .list(cwd)
          .pipe(Effect.flatMap((profiles) => Interactive.listProfiles(ui, profiles)));
        return;
      }
      case 'Show': {
        const profiles = yield* store.list(cwd);
        yield* Interactive.showProfile(ui, profiles, action.name);
        return;
      }
      case 'Verify': {
        const raw = yield* store.readRaw(cwd, action.name).pipe(
          Effect.mapError((error) => error.message),
        );
        const result = PiProfiles.verifyProfileFile(action.name, raw);
        yield* Interactive.notifyVerifyResult(ui, action.name, result);
        if (!result.valid) {
          return yield* Effect.fail(
            `'${action.name}' failed verification: ${result.issues.map((found) => `[${found.field}] ${found.message}`).join('; ')}`,
          );
        }
        return;
      }
      case 'Create': {
        if (action.fields.description === undefined) {
          return yield* Effect.fail('create requires --description "text".');
        }
        if (!PiProfiles.isValidName(action.name)) {
          return yield* Effect.fail(
            `Invalid profile name '${action.name}' — use kebab-case (lowercase, hyphen-separated).`,
          );
        }
        const profile = yield* PiProfiles.decodeUnknown({
          name: action.name,
          description: action.fields.description,
          model: action.fields.model ?? '',
          skills: action.fields.skills ?? [],
          instructions: action.fields.instructions ?? '',
          checklist: action.fields.checklist ?? [],
        }).pipe(Effect.mapError(() => `Invalid profile fields for '${action.name}'.`));
        yield* store.save(cwd, profile).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved profile '${profile.name}'.`, 'info'));
        return;
      }
      case 'Modify': {
        const profiles = yield* store.list(cwd);
        const profile = yield* findOrFail(profiles, action.name);
        const encoded = PiProfiles.encode(profile);
        const updated = yield* PiProfiles.decodeUnknown({
          ...encoded,
          description: action.fields.description ?? encoded.description,
          model: action.fields.model ?? encoded.model,
          skills: action.fields.skills ?? encoded.skills,
          instructions: action.fields.instructions ?? encoded.instructions,
          checklist: action.fields.checklist ?? encoded.checklist,
        }).pipe(Effect.mapError(() => `Invalid profile fields for '${action.name}'.`));
        yield* store.save(cwd, updated).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Saved profile '${updated.name}'.`, 'info'));
        return;
      }
      case 'Delete': {
        const profiles = yield* store.list(cwd);
        const profile = yield* findOrFail(profiles, action.name);
        yield* store.remove(cwd, profile.name).pipe(Effect.mapError((error) => error.message));
        yield* Effect.sync(() => ui.notify(`Deleted profile '${profile.name}'.`, 'info'));
        return;
      }
    }
  });

/**
 * Register the `/mf-profiles-cli` slash command as an Effect. Failures notify.
 * @param api - Pi extension API
 * @param live - store layer provided to the handler at invocation
 * @returns Effect completing once the command is registered
 */
export const register = (
  api: Pick<ExtensionAPI, 'registerCommand'>,
  live: Layer.Layer<ProfileStore.ProfileStore>,
): Effect.Effect<void> =>
  PiEffect.registerCommandEffect(api, COMMAND_NAME, COMMAND_DESCRIPTION, (args, ctx) =>
    run(args, ctx.ui, ctx.cwd).pipe(Effect.provide(live)),
  );
