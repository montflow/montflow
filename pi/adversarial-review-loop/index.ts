import { Effect, Match, Schema } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { runGraph, type LoopOptions } from './graph';
import { validateFeatureSpecFromBranch } from './feature-spec';
import {
  DEFAULT_REVIEWER_MODEL,
  resolveLoopConfig,
  resolveLoopConfigPure,
  SUPERVISOR_MODES,
  type LoopConfig,
} from './config';

export { getCurrentGitBranch } from './git';
export { validateFeatureSpecFromBranch } from './feature-spec';
export {
  defaultLoopConfig,
  resolveLoopConfig,
  BUILTIN_REVIEWERS,
  usesSupervisor,
} from './config';

export type ParsedOptions =
  | { readonly ok: true; readonly opts: LoopOptions }
  | { readonly ok: false; readonly err: unknown };

const BOOLEAN_FLAGS = new Set(['feature-spec', 'fresh']);

const VALUE_FLAGS = new Set([
  'reviewer-model',
  'fixer-model',
  'max-loops',
  'depth',
  'target-dir',
  'dir',
  'name',
  'feature-spec',
  'fresh',
  'spec-name',
  'config',
  'reviewers',
  'supervisor-model',
  'supervisor-mode',
]);

interface RawFlags {
  readonly map: Record<string, string>;
  readonly bareFlags: Set<string>;
}

/**
 * A single CLI token classified into a tagged variant.
 * - `--flag=` — flag with an explicitly empty value
 * - `--flag=value` — flag with an inline value
 * - `--flag` — bare flag (boolean, or value taken from the next token)
 * - anything else — positional token (ignored)
 */
type ParsedToken =
  | { readonly kind: 'emptyEqFlag'; readonly key: string }
  | { readonly kind: 'eqFlag'; readonly key: string; readonly value: string }
  | { readonly kind: 'bareFlag'; readonly key: string }
  | { readonly kind: 'positional'; readonly value: string };

/**
 * Classifies a CLI token (e.g. `--dir=x`, `--dir`, `x`) into a tagged variant
 * via the `Match` module.
 * @param {string} token Raw token from the command line
 * @returns The classified token
 */
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
 * Tokenizes `--flag=value`, `--flag value`, and bare `--flag` args into a map.
 * Value flags accept both `--flag=value` and `--flag value` (next token) forms;
 * boolean flags (see {@link BOOLEAN_FLAGS}) may be passed bare.
 * @param {string} args Raw argument string from the Pi command
 * @returns Parsed flag map and bare flags
 */
const tokenizeFlags = (args: string): RawFlags => {
  const map: Record<string, string> = {};
  const bareFlags = new Set<string>();
  const tokens = args.split(/\s+/).filter((token) => token !== '');

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
        if (!VALUE_FLAGS.has(key)) {
          throw new Error(
            `Unknown flag: --${key}. Known flags: ${[...VALUE_FLAGS].map((flag) => `--${flag}`).join(', ')}.`,
          );
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
            throw new Error(
              `Flag --${key} expects a value: use --${key}=<value> or --${key} <value>.`,
            );
          }
          map[key] = next;
          return 2;
        }
        throw new Error(
          `Unknown flag: --${key}. Known flags: ${[...VALUE_FLAGS].map((flag) => `--${flag}`).join(', ')}.`,
        );
      }),
      Match.orElse(() => 1),
    );
    index += consumed;
  }
  return { map, bareFlags };
};

/**
 * Positive integer flag value (e.g. `--max-loops`), decoded from a string.
 * Rejects non-integers (`2.5`) and values outside the positive range.
 */
const PositiveIntFromString = Schema.NumberFromString.pipe(
  (schema) => schema.check(Schema.isGreaterThan(0)),
  Schema.decodeTo(Schema.Int),
);

/**
 * Schema-decodable overrides parsed from the `--flag=value` CLI flags.
 * Unknown extra keys in the raw map are ignored by the decoder.
 */
const FlagOverridesSchema = Schema.Struct({
  'reviewer-model': Schema.optionalKey(Schema.NonEmptyString),
  'fixer-model': Schema.optionalKey(Schema.NonEmptyString),
  'max-loops': Schema.optionalKey(PositiveIntFromString),
  'depth': Schema.optionalKey(PositiveIntFromString),
  'target-dir': Schema.optionalKey(Schema.NonEmptyString),
  'dir': Schema.optionalKey(Schema.NonEmptyString),
  'name': Schema.optionalKey(Schema.NonEmptyString),
  'spec-name': Schema.optionalKey(Schema.NonEmptyString),
  'config': Schema.optionalKey(Schema.NonEmptyString),
  'reviewers': Schema.optionalKey(Schema.NonEmptyString),
  'supervisor-model': Schema.optionalKey(Schema.NonEmptyString),
  'supervisor-mode': Schema.optionalKey(Schema.Literals(SUPERVISOR_MODES)),
});

/** Typed, validated overrides decoded from the CLI flag map. */
type FlagOverrides = Schema.Schema.Type<typeof FlagOverridesSchema>;

/**
 * Decodes the raw flag map into typed, validated overrides.
 * Throws a Schema parse error when a value fails validation
 * (e.g. a non-positive-integer `--max-loops`).
 * @param {Record<string, string>} map Parsed flag map
 * @returns The decoded overrides
 */
const decodeFlagOverrides = (map: Record<string, string>): FlagOverrides =>
  Schema.decodeUnknownSync(FlagOverridesSchema)(map);

/**
 * Builds LoopOptions from decoded overrides + a resolved LoopConfig.
 * @param {RawFlags} flags Parsed flags (for bare boolean flags)
 * @param {FlagOverrides} overrides Schema-decoded flag overrides
 * @param {string} cwd Default working directory
 * @param {LoopConfig} config Resolved loop config
 * @returns Loop options
 */
const toLoopOptions = (
  flags: RawFlags,
  overrides: FlagOverrides,
  cwd: string,
  config: LoopConfig,
): LoopOptions => {
  const { map, bareFlags } = flags;
  const featureSpec =
    map['feature-spec'] === 'true' || map['feature-spec'] === '1' || bareFlags.has('feature-spec');
  const fresh = map['fresh'] === 'true' || map['fresh'] === '1' || bareFlags.has('fresh');

  return {
    reviewerModel: config.reviewers[0]?.model ?? DEFAULT_REVIEWER_MODEL,
    fixerModel: config.fixerModel,
    maxLoops: config.maxLoops,
    targetDir: overrides['target-dir'] ?? overrides['dir'] ?? cwd,
    reviewName: overrides['name'] ?? 'adversarial',
    fresh,
    featureSpec,
    specName: overrides['spec-name'] ?? '',
    config,
  };
};

/**
 * Builds the config-resolution input from decoded flag overrides.
 * @param {FlagOverrides} overrides Schema-decoded flag overrides
 * @param {string} cwd Working directory
 * @returns resolveLoopConfig input
 */
const resolveInputFromFlags = (overrides: FlagOverrides, cwd: string) => {
  const reviewerIds = (overrides['reviewers'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  return {
    configPath: overrides['config'] ?? '',
    reviewerIds,
    reviewerModel: overrides['reviewer-model'],
    fixerModel: overrides['fixer-model'],
    maxLoops: overrides['max-loops'] ?? overrides['depth'],
    cwd,
    supervisorModel: overrides['supervisor-model'],
    supervisorMode: overrides['supervisor-mode'],
  };
};

/**
 * Parses raw args into loop options, loading `--config` via Effect when present.
 * @param {string} args Raw argument string from the Pi command
 * @param {string} cwd Default working directory
 * @returns Effect yielding parsed loop options
 */
export const parseOptionsEffect = (
  args: string,
  cwd: string,
): Effect.Effect<LoopOptions, Error, never> =>
  Effect.gen(function* () {
    const flags = tokenizeFlags(args);
    const overrides = decodeFlagOverrides(flags.map);
    const input = resolveInputFromFlags(overrides, cwd);

    const config = yield* resolveLoopConfig(input).pipe(
      Effect.mapError((error) => new Error(error.message)),
    );

    return toLoopOptions(flags, overrides, cwd, config);
  }).pipe(Effect.provide(NodeServices.layer));

/**
 * Parses options synchronously (no `--config` file). Throws on invalid flags.
 * @param {string} args Raw argument string from the Pi command
 * @param {string} cwd Default working directory
 * @returns The parsed loop options
 */
export const parseOptions = (args: string, cwd: string): LoopOptions => {
  const flags = tokenizeFlags(args);
  if (flags.map['config'] !== undefined && flags.map['config'] !== '') {
    throw new Error(
      'parseOptions cannot load --config synchronously; use parseOptionsEffect or the command handler',
    );
  }

  const overrides = decodeFlagOverrides(flags.map);
  const resolved = resolveLoopConfigPure(resolveInputFromFlags(overrides, cwd), undefined);
  if (typeof resolved === 'string') throw new Error(resolved);
  return toLoopOptions(flags, overrides, cwd, resolved);
};

/**
 * Parse options, capturing errors as a discriminated union.
 * @param {string} args Raw argument string
 * @param {string} cwd Default working directory
 * @returns The parse result
 */
export const tryParseOptions = (args: string, cwd: string): ParsedOptions => {
  try {
    return { ok: true, opts: parseOptions(args, cwd) };
  } catch (error) {
    return { ok: false, err: error };
  }
};

/**
 * Pi extension entry: registers the /adversarial-review-loop command.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns Nothing
 */
export default function adversarialReviewLoopExtension(pi: ExtensionAPI): void {
  pi.registerCommand('adversarial-review-loop', {
    description:
      'Run an adversarial review loop: configurable reviewers (default: generic) → ' +
      'optional supervisor (multi-reviewer) → fixer, coordinating through a shared review file. ' +
      'Skills ship with the extension under skills/.',
    handler: async (args, ctx) => {
      const parsed = tryParseOptions(args, ctx.cwd);
      // Fast path: no --config. For --config, resolve via Effect below.
      const needsConfigFile = /(?:^|\s)--config=/.test(args);

      try {
        const opts = needsConfigFile
          ? await Effect.runPromise(parseOptionsEffect(args, ctx.cwd))
          : parsed.ok
            ? parsed.opts
            : (() => {
                throw parsed.err;
              })();

        await Effect.runPromise(
          runGraph({
            opts,
            cwd: ctx.cwd,
            ui: ctx.ui,
            validateFeatureSpecFromBranch,
          }).pipe(Effect.provide(NodeServices.layer)),
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
