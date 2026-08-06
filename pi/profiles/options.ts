import { Match } from 'effect';

/**
 * CLI options for the profiles extension.
 *
 * The same parser serves the pi command (`/profiles <args>`) and the
 * standalone CLI (`cli.ts`, via NodeRuntime.runMain). The extension is a
 * pure profile store: new / modify / delete / list (+ read-only show).
 */

/** Fields for a `new` command, supplied by flags or the interactive wizard. */
export interface NewProfileFields {
  readonly name?: string;
  readonly description?: string;
  readonly model?: string;
  readonly skills: readonly string[];
  readonly instructions?: string;
  readonly instructionsFile?: string;
  readonly checklist: readonly string[];
}

export type ProfilesCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'menu' }
  | { readonly kind: 'list' }
  | { readonly kind: 'template' }
  | { readonly kind: 'show'; readonly name: string }
  | { readonly kind: 'edit'; readonly name: string }
  | { readonly kind: 'delete'; readonly name: string; readonly force: boolean }
  | { readonly kind: 'new'; readonly fields: NewProfileFields; readonly force: boolean };

export const USAGE = [
  'Usage:',
  '  /profiles                     interactive menu (new | modify | delete | list)',
  '  /profiles --list              list profiles',
  '  /profiles --show <name>       show a profile',
  '  /profiles --modify <name>     modify a profile (alias: --edit)',
  '  /profiles --delete <name>     delete a profile (--force skips confirm)',
  '  /profiles --template          show the PROFILE.md template',
  '  /profiles --new [--name <slug>] [--description <text>] [--model <provider/model>]',
  '            [--skills a,b,c] [--instructions <text>]',
  '  /profiles --new               no args: interactive wizard (manual or agentic)',
  '            [--instructions-file <path>] [--checklist "a|b"] [--force]',
  '  /profiles --help              this help',
  '',
  'This extension only stores profiles. It never activates, executes, or injects',
  'anything. Other extensions read profile context via the profiles:get event bus',
  '(see README "Getting profile context").',
].join('\n');

const BOOLEAN_FLAGS = new Set([
  'new',
  'list',
  'ls',
  'template',
  'help',
  'force',
]);

const VALUE_FLAGS = new Set([
  'show',
  'edit',
  'modify',
  'delete',
  'name',
  'description',
  'model',
  'skills',
  'instructions',
  'instructions-file',
  'checklist',
]);

interface RawFlags {
  readonly map: Record<string, string>;
  readonly bareFlags: Set<string>;
}

type ParsedToken =
  | { readonly kind: 'emptyEqFlag'; readonly key: string }
  | { readonly kind: 'eqFlag'; readonly key: string; readonly value: string }
  | { readonly kind: 'bareFlag'; readonly key: string }
  | { readonly kind: 'positional'; readonly value: string };

const classifyToken = (token: string): ParsedToken =>
  Match.value(token).pipe(
    Match.when((candidate) => candidate.startsWith('--'), (flagToken) => {
      const eqIndex = flagToken.indexOf('=');
      if (eqIndex === -1) return { kind: 'bareFlag', key: flagToken.slice(2) } as const;
      const key = flagToken.slice(2, eqIndex);
      const value = flagToken.slice(eqIndex + 1);
      if (value === '') return { kind: 'emptyEqFlag', key } as const;
      return { kind: 'eqFlag', key, value } as const;
    }),
    Match.orElse((value) => ({ kind: 'positional', value }) as const),
  );

/**
 * Tokenizes an arg string into tokens, honoring double/single quotes and
 * `--flag="quoted value"` forms. Quotes are stripped from the tokens.
 */
const tokenize = (args: string): string[] => {
  const tokens: string[] = [];
  const pattern = /([^\s"']+)=(?:"([^"]*)"|'([^']*)')|"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(args)) !== null) {
    const eqKey = match[1];
    const eqDouble = match[2];
    const eqSingle = match[3];
    const double = match[4];
    const single = match[5];
    const bare = match[6];
    if (eqKey !== undefined) {
      tokens.push(`${eqKey}=${eqDouble ?? eqSingle ?? ''}`);
    } else if (double !== undefined) {
      tokens.push(double);
    } else if (single !== undefined) {
      tokens.push(single);
    } else {
      tokens.push(bare ?? '');
    }
  }
  return tokens;
};

/**
 * Tokenizes `--flag=value`, `--flag value`, and bare `--flag` args.
 * Accepts pre-tokenized entries (from argv) or a raw string (from pi command
 * args, where quotes may still be present).
 */
export const tokenizeFlags = (args: string | readonly string[]): RawFlags => {
  const tokens = typeof args === 'string' ? tokenize(args) : args;
  const map: Record<string, string> = {};
  const bareFlags = new Set<string>();

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) break;
    const next = tokens[index + 1];

    const consumed = Match.value(classifyToken(token)).pipe(
      Match.when({ kind: 'emptyEqFlag' }, ({ key }) => {
        throw new Error(`Flag --${key} expects a non-empty value (--flag=value).`);
      }),
      Match.when({ kind: 'eqFlag' }, ({ key, value }) => {
        if (!VALUE_FLAGS.has(key) && !BOOLEAN_FLAGS.has(key)) {
          throw new Error(`Unknown flag: --${key}. See /profiles --help.`);
        }
        map[key] = value;
        return 1;
      }),
      Match.when({ kind: 'bareFlag' }, ({ key }) => {
        if (BOOLEAN_FLAGS.has(key)) {
          bareFlags.add(key);
          return 1;
        }
        if (VALUE_FLAGS.has(key)) {
          if (next === undefined || next.startsWith('--')) {
            throw new Error(`Flag --${key} expects a value: use --${key}=<value> or --${key} <value>.`);
          }
          map[key] = next;
          return 2;
        }
        throw new Error(`Unknown flag: --${key}. See /profiles --help.`);
      }),
      Match.orElse(() => 1),
    );
    index += consumed;
  }

  return { map, bareFlags };
};

const isBare = (flags: RawFlags, key: string): boolean =>
  flags.bareFlags.has(key) || flags.map[key] === 'true' || flags.map[key] === '1';

const splitList = (value: string | undefined, separator: RegExp): readonly string[] =>
  (value ?? '')
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item !== '');

/**
 * Parses raw args into a {@link ProfilesCommand}.
 * Throws an `Error` on invalid flags or conflicting commands.
 */
export const parseOptions = (args: string): ProfilesCommand =>
  parseOptionsFromTokens(tokenize(args));

/**
 * Parses pre-tokenized args (e.g. `process.argv` from the standalone CLI)
 * into a {@link ProfilesCommand}. Throws an `Error` on invalid flags.
 */
export const parseOptionsFromTokens = (tokens: readonly string[]): ProfilesCommand => {
  const flags = tokenizeFlags(tokens);
  const { map } = flags;

  const commands: string[] = [];
  if (isBare(flags, 'help')) commands.push('help');
  if (isBare(flags, 'list') || isBare(flags, 'ls')) commands.push('list');
  if (isBare(flags, 'template')) commands.push('template');
  if (isBare(flags, 'new')) commands.push('new');
  if (map['show'] !== undefined) commands.push('show');
  if (map['edit'] !== undefined || map['modify'] !== undefined) commands.push('edit');
  if (map['delete'] !== undefined) commands.push('delete');

  if (commands.length > 1) {
    throw new Error(`Conflicting commands: --${commands.join(', --')}. Use one at a time.`);
  }

  const force = isBare(flags, 'force');

  const command = commands[0] ?? 'menu';
  let resolved: ProfilesCommand;
  switch (command) {
    case 'help':
      resolved = { kind: 'help' };
      break;
    case 'list':
      resolved = { kind: 'list' };
      break;
    case 'template':
      resolved = { kind: 'template' };
      break;
    case 'show':
      resolved = { kind: 'show', name: map['show'] ?? '' };
      break;
    case 'edit':
      resolved = { kind: 'edit', name: map['edit'] ?? map['modify'] ?? '' };
      break;
    case 'delete':
      resolved = { kind: 'delete', name: map['delete'] ?? '', force };
      break;
    case 'new': {
      const fields: NewProfileFields = {
        name: map['name'],
        description: map['description'],
        model: map['model'],
        skills: splitList(map['skills'], /,/),
        instructions: map['instructions'],
        instructionsFile: map['instructions-file'],
        checklist: splitList(map['checklist'], /\|/),
      };
      resolved = { kind: 'new', fields, force };
      break;
    }
    default:
      resolved = { kind: 'menu' };
  }

  return resolved;
};

export interface ParsedOptions {
  readonly ok: boolean;
  readonly command?: ProfilesCommand;
  readonly err?: unknown;
}

/** Parses options, capturing errors as a discriminated union. */
export const tryParseOptions = (args: string): ParsedOptions => {
  try {
    return { ok: true, command: parseOptions(args) };
  } catch (error) {
    return { ok: false, err: error };
  }
};

/** Parses pre-tokenized options (standalone CLI), capturing errors. */
export const tryParseOptionsFromTokens = (tokens: readonly string[]): ParsedOptions => {
  try {
    return { ok: true, command: parseOptionsFromTokens(tokens) };
  } catch (error) {
    return { ok: false, err: error };
  }
};
