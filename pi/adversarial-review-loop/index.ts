import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { runGraph, type LoopOptions } from './graph';
import { validateFeatureSpecFromBranch } from './feature-spec';
import {
  DEFAULT_DEPTH,
  DEFAULT_REVIEWER_MODEL,
  parseSupervisorMode,
  resolveLoopConfig,
  resolveLoopConfigPure,
  type LoopConfig,
  type SupervisorMode,
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
 * Tokenizes `--flag=value` / bare `--flag` args into a map.
 * @param {string} args Raw argument string from the Pi command
 * @returns Parsed flag map and bare flags
 */
const tokenizeFlags = (args: string): RawFlags => {
  const map: Record<string, string> = {};
  const bareFlags = new Set<string>();
  for (const token of args.split(/\s+/)) {
    if (token === '') continue;
    const emptyMatch = token.match(/^--(\w[\w-]*)=$/);
    if (emptyMatch) {
      throw new Error(`Flag --${emptyMatch[1]} expects a non-empty value (--flag=value).`);
    }
    const eqMatch = token.match(/^--(\w[\w-]*)=(.+)/);
    if (eqMatch) {
      const key = eqMatch[1];
      const value = eqMatch[2];
      if (key === undefined || value === undefined) continue;
      if (!VALUE_FLAGS.has(key)) {
        throw new Error(
          `Unknown flag: --${key}. Known flags: ${[...VALUE_FLAGS].map((flag) => `--${flag}`).join(', ')}`,
        );
      }
      map[key] = value;
      continue;
    }
    const bareMatch = token.match(/^--(\w[\w-]*)$/);
    const bareKey = bareMatch?.[1];
    if (bareKey !== undefined) {
      if (!BOOLEAN_FLAGS.has(bareKey)) {
        throw new Error(
          `Flag --${bareKey} is not a recognized boolean flag. Boolean flags (${[...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(', ')}) may be passed bare; value flags must use --flag=value form.`,
        );
      }
      bareFlags.add(bareKey);
    }
  }
  return { map, bareFlags };
};

/**
 * Parses max-loops/depth from the flag map.
 * @param {Record<string, string>} map Flag map
 * @param {boolean} required Whether a missing value should fall back to DEFAULT_DEPTH
 * @returns Parsed max loops, or undefined when optional and absent
 */
const parseMaxLoopsFlag = (
  map: Record<string, string>,
  required: boolean,
): number | undefined => {
  const maxLoopsRaw = map['max-loops'] ?? map['depth'];
  if (maxLoopsRaw === undefined) {
    return required ? DEFAULT_DEPTH : undefined;
  }
  const maxLoops = parseInt(maxLoopsRaw, 10);
  if (!Number.isFinite(maxLoops) || maxLoops < 1) {
    throw new Error(`--max-loops/--depth must be a positive integer, got: '${maxLoopsRaw}'`);
  }
  return maxLoops;
};

/**
 * Builds LoopOptions from raw flags + a resolved LoopConfig.
 * @param {RawFlags} flags Parsed flags
 * @param {string} cwd Default working directory
 * @param {LoopConfig} config Resolved loop config
 * @returns Loop options
 */
const toLoopOptions = (flags: RawFlags, cwd: string, config: LoopConfig): LoopOptions => {
  const { map, bareFlags } = flags;
  const featureSpec =
    map['feature-spec'] === 'true' || map['feature-spec'] === '1' || bareFlags.has('feature-spec');
  const fresh = map['fresh'] === 'true' || map['fresh'] === '1' || bareFlags.has('fresh');

  return {
    reviewerModel: config.reviewers[0]?.model ?? DEFAULT_REVIEWER_MODEL,
    fixerModel: config.fixerModel,
    maxLoops: config.maxLoops,
    targetDir: map['target-dir'] ?? map['dir'] ?? cwd,
    reviewName: map['name'] ?? 'adversarial',
    fresh,
    featureSpec,
    specName: map['spec-name'] ?? '',
    config,
  };
};

/**
 * Shared resolve-input builder from tokenized flags.
 * @param {RawFlags} flags Parsed flags
 * @param {string} cwd Working directory
 * @param {number | undefined} maxLoops Optional max-loops override
 * @returns resolveLoopConfig input
 */
const resolveInputFromFlags = (
  flags: RawFlags,
  cwd: string,
  maxLoops: number | undefined,
) => {
  const { map } = flags;
  const reviewerIds =
    map['reviewers'] !== undefined
      ? map['reviewers'].split(',').map((id) => id.trim()).filter((id) => id !== '')
      : [];
  const supervisorModeRaw = map['supervisor-mode'];
  let supervisorMode: SupervisorMode | undefined;
  if (supervisorModeRaw !== undefined) {
    supervisorMode = parseSupervisorMode(supervisorModeRaw);
    if (supervisorMode === undefined) {
      throw new Error(
        `--supervisor-mode must be on-multi|always|never, got: '${supervisorModeRaw}'`,
      );
    }
  }
  return {
    configPath: map['config'] ?? '',
    reviewerIds,
    reviewerModel: map['reviewer-model'],
    fixerModel: map['fixer-model'],
    maxLoops,
    cwd,
    supervisorModel: map['supervisor-model'],
    supervisorMode,
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
    const maxLoops = parseMaxLoopsFlag(flags.map, false);
    const input = resolveInputFromFlags(flags, cwd, maxLoops);

    const config = yield* resolveLoopConfig(input).pipe(
      Effect.mapError((error) => new Error(error.message)),
    );

    return toLoopOptions(flags, cwd, config);
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

  const maxLoops = parseMaxLoopsFlag(flags.map, true);
  const resolved = resolveLoopConfigPure(resolveInputFromFlags(flags, cwd, maxLoops), undefined);
  if (typeof resolved === 'string') throw new Error(resolved);
  return toLoopOptions(flags, cwd, resolved);
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
