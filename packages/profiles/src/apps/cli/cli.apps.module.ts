import { Effect } from 'effect';
import { ProfileStore } from '../../services/index.js';
import * as Interactive from '../interactive/index.js';
import {
  LIST_STATUSES,
  create,
  filterByStatus,
  list,
  modify,
  remove,
  resolveListStatus,
  show,
  verifyAll,
  type ProfileFields,
} from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';

export { LIST_STATUSES, resolveListStatus };

/**
 * The `/mf-profiles-cli` slash front end: a hand-rolled parser over the same
 * engines the `mf-profiles` binary uses.
 *
 * A bespoke parser rather than `effect/cli` because an OpenCode slash command
 * receives a single argument *string*, not an argv array, so the bin's
 * `Command` tree cannot be reused here. Everything below the parser is shared.
 */

/** Slash-command name (invoke as `/mf-profiles-cli`). */
export const COMMAND_NAME = 'mf-profiles-cli';

/** Help text shown for the command and the `help` action. */
export const COMMAND_DESCRIPTION =
  'Manage agent profiles non-interactively: list [--status valid|invalid], create, show, modify, or delete a profile.';

/** Usage line notified by the `help` action. */
export const USAGE =
  '/mf-profiles-cli list [--status valid|invalid] | show <name> | verify [<name>...] | create <name> --description "text" [--model p/m] [--skills a,b] [--instructions "text"] [--checklist "item 1; item 2"] | modify <name> [--description ...] [--model ...] [--skills ...] [--instructions ...] [--checklist ...] | delete <name> | help';

/** Fields for `create` / `modify`, re-exported under the historical name. */
export type CliFields = ProfileFields;

/** Parsed `/mf-profiles-cli` invocation. Never prompts — gaps fail. */
export type CliAction =
  | { readonly kind: 'Help' }
  | { readonly kind: 'List'; readonly status: string | undefined }
  | { readonly kind: 'Show'; readonly name: string }
  | { readonly kind: 'Verify'; readonly names: ReadonlyArray<string> }
  | { readonly kind: 'Create'; readonly name: string; readonly fields: ProfileFields }
  | { readonly kind: 'Modify'; readonly name: string; readonly fields: ProfileFields }
  | { readonly kind: 'Delete'; readonly name: string };

/** Flags this CLI understands on `create` / `modify`. Anything else is usage. */
const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  'description',
  'model',
  'skills',
  'instructions',
  'checklist',
]);

/** Flags `list` understands. Anything else is usage. */
const KNOWN_LIST_FLAGS: ReadonlySet<string> = new Set(['status']);

/** Token split: bare positionals plus `--flag value` / `--flag=value` pairs. */
interface SplitTokens {
  readonly positionals: readonly string[];
  readonly flags: Record<string, string>;
  readonly unknown: readonly string[];
}

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

const fieldsOf = (split: SplitTokens): ProfileFields => ({
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
    case 'list': {
      const split = splitTokens(tokens.slice(1), KNOWN_LIST_FLAGS);
      if (split.unknown.length > 0) return { kind: 'Help' };
      return { kind: 'List', status: one(split.flags['status']) };
    }
    case 'show':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Show', name: tokens[1] };
    case 'verify':
      return { kind: 'Verify', names: tokens.slice(1).filter((token) => token !== '') };
    case 'delete':
      return tokens[1] === undefined ? { kind: 'Help' } : { kind: 'Delete', name: tokens[1] };
    case 'create':
    case 'modify': {
      const split = splitTokens(tokens.slice(1), KNOWN_FLAGS);
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

/**
 * Run one parsed args string end to end: parse, load, execute, save, notify.
 * Never opens a dialog — missing input fails with a message. No agentic
 * workflows: every field comes from flags, so agents and scripts can
 * drive it mechanically.
 * @param args - raw slash-command args
 * @param ui - OpenCode ui surface (notify only; dialogs never called)
 * @param cwd - workspace root owning the profiles and skills stores
 * @returns Effect completing once done, failing with displayable message
 */
export const run = (
  args: string,
  ui: Interactive.InteractiveUi,
  cwd: string,
): Effect.Effect<void, string, ProfileStore.ProfileStore> => {
  const action = parseCliArgs(args);
  const say = (text: string): Effect.Effect<void> => Effect.sync(() => ui.notify(text, 'info'));
  return Effect.gen(function* () {
    switch (action.kind) {
      case 'Help':
        return yield* say(USAGE);
      case 'List': {
        const status = yield* resolveListStatus(action.status);
        const profiles = yield* list(cwd);
        const shown =
          status === undefined
            ? profiles.map((profile) => ({ profile, warningCount: 0 }))
            : yield* filterByStatus(cwd, profiles, status);
        if (shown.length === 0 && status !== undefined) {
          return yield* say(`No profiles with status '${status}'.`);
        }
        return yield* say(Renderers.list(shown));
      }
      case 'Show': {
        const profile = yield* show(cwd, action.name);
        return yield* say(Renderers.show(profile));
      }
      case 'Verify': {
        const report = yield* verifyAll(cwd, action.names.length > 0 ? action.names : undefined);
        for (const entry of report.entries) {
          yield* say(Renderers.verify(entry.name, entry.result));
        }
        for (const warning of report.warnings) {
          yield* Effect.sync(() => ui.notify(`! ${warning}`, 'warning'));
        }
        const failed = report.entries.filter((entry) => !entry.result.valid);
        if (failed.length > 0) {
          return yield* Effect.fail(
            `Verification failed: ${failed
              .flatMap((entry) =>
                entry.result.issues.map(
                  (found) => `[${entry.name}] [${found.field}] ${found.message}`,
                ),
              )
              .join('; ')}`,
          );
        }
        return;
      }
      case 'Create': {
        const profile = yield* create(cwd, action.name, action.fields);
        return yield* say(Renderers.saved(profile));
      }
      case 'Modify': {
        const profile = yield* modify(cwd, action.name, action.fields);
        return yield* say(Renderers.saved(profile));
      }
      case 'Delete': {
        const profile = yield* remove(cwd, action.name);
        return yield* say(Renderers.deleted(profile.name));
      }
    }
  });
};
