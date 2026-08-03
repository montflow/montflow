import { Data, Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import {
  REVIEWER_SKILL_PATH,
  RECONCILIATOR_SKILL_PATH,
  SUPERVISOR_SKILL_PATH,
} from './skill-paths';

/** How the LLM reconciliator is invoked after programmatic merge (fallback when supervisor is off). */
export type ReconcileMode = 'on-conflict' | 'always' | 'never';

/**
 * When the supervisor LLM runs.
 * - `on-multi` — only when the roster has more than one reviewer (default)
 * - `always` — even for a single generic reviewer
 * - `never` — use legacy programmatic merge + reconciliator
 */
export type SupervisorMode = 'on-multi' | 'always' | 'never';

export interface ReviewerProfile {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly skillPath: string;
  /** Specialist objective / focus lens for this reviewer. */
  readonly objective: string;
  /**
   * @deprecated Use `objective`. Kept in sync for older call sites.
   */
  readonly focus: string;
}

export interface SupervisorConfig {
  readonly model: string;
  readonly skillPath: string;
  readonly mode: SupervisorMode;
}

export interface ReconciliatorConfig {
  readonly model: string;
  readonly skillPath: string;
  readonly mode: ReconcileMode;
}

export interface DeadlockConfig {
  readonly flipThreshold: number;
  readonly action: 'escalate';
}

export interface LoopConfig {
  readonly reviewers: readonly ReviewerProfile[];
  readonly supervisor: SupervisorConfig;
  readonly reconciliator: ReconciliatorConfig;
  readonly fixerModel: string;
  readonly maxLoops: number;
  readonly deadlock: DeadlockConfig;
}

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string;
}> {}

export const DEFAULT_REVIEWER_MODEL = 'deepseek-v4-pro';

export const DEFAULT_FIXER_MODEL = 'deepseek-v4-flash-free';

export const DEFAULT_DEPTH = 5;

interface BuiltinReviewer {
  readonly id: string;
  readonly label: string;
  readonly defaultModel: string;
  readonly skillPath: string;
  readonly objective: string;
}

interface FileReviewerEntry {
  readonly id?: unknown;
  readonly label?: unknown;
  readonly model?: unknown;
  readonly skill?: unknown;
  readonly skillPath?: unknown;
  readonly objective?: unknown;
  readonly focus?: unknown;
}

interface FileConfig {
  readonly reviewers?: readonly FileReviewerEntry[];
  readonly supervisor?: {
    readonly model?: unknown;
    readonly skill?: unknown;
    readonly skillPath?: unknown;
    readonly mode?: unknown;
  };
  readonly reconciliator?: {
    readonly model?: unknown;
    readonly skill?: unknown;
    readonly skillPath?: unknown;
    readonly mode?: unknown;
  };
  readonly fixer?: { readonly model?: unknown };
  readonly fixerModel?: unknown;
  readonly maxLoops?: unknown;
  readonly deadlock?: {
    readonly flipThreshold?: unknown;
    readonly action?: unknown;
  };
}

/**
 * Builds a reviewer profile with objective/focus kept in sync.
 * @param {object} input Profile fields
 * @returns The reviewer profile
 */
export const makeReviewerProfile = (input: {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly skillPath: string;
  readonly objective: string;
}): ReviewerProfile => ({
  id: input.id,
  label: input.label,
  model: input.model,
  skillPath: input.skillPath,
  objective: input.objective,
  focus: input.objective,
});

/**
 * Built-in generic reviewer profile — the default roster is this alone.
 * @param {string} [model] Optional model override
 * @returns The generic reviewer profile
 */
export const genericReviewer = (model: string = DEFAULT_REVIEWER_MODEL): ReviewerProfile =>
  makeReviewerProfile({
    id: 'generic',
    label: 'Generic',
    model,
    skillPath: REVIEWER_SKILL_PATH,
    objective: 'full adversarial audit — correctness, security, edge cases, design, tests, docs',
  });

/** Built-in specialist profiles selectable via `--reviewers=…`. */
export const BUILTIN_REVIEWERS: Readonly<Record<string, BuiltinReviewer>> = {
  generic: {
    id: 'generic',
    label: 'Generic',
    defaultModel: DEFAULT_REVIEWER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'full adversarial audit — correctness, security, edge cases, design, tests, docs',
  },
  security: {
    id: 'security',
    label: 'Security',
    defaultModel: DEFAULT_REVIEWER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'auth, injection, secrets, trust boundaries, unsafe defaults, and privilege mistakes',
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    defaultModel: DEFAULT_REVIEWER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'architecture, correctness, concurrency, error handling, edge cases, and high-level design defects',
  },
  /** Security-inclusive variant of `quality` (legacy id) — NOT a true alias: its objective adds security. */
  technical: {
    id: 'technical',
    label: 'Technical',
    defaultModel: DEFAULT_REVIEWER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'architecture, correctness, concurrency, security, edge cases, and high-level design defects',
  },
  guidelines: {
    id: 'guidelines',
    label: 'Guidelines',
    defaultModel: DEFAULT_FIXER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'project coding guidelines — SOLID, Result-over-throws, nesting/early-returns, type safety, composition',
  },
  style: {
    id: 'style',
    label: 'Style',
    defaultModel: DEFAULT_FIXER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective: 'naming, JSDoc completeness, formatting conventions, and stylistic consistency',
  },
  linguist: {
    id: 'linguist',
    label: 'Linguist',
    defaultModel: DEFAULT_FIXER_MODEL,
    skillPath: REVIEWER_SKILL_PATH,
    objective:
      'wording clarity in user-facing copy, docs, API names, error messages, and comments',
  },
};

/**
 * Default loop config: single generic reviewer, no supervisor, hybrid reconcile fallback.
 * @returns The default loop configuration
 */
export const defaultLoopConfig = (): LoopConfig => ({
  reviewers: [genericReviewer()],
  supervisor: {
    model: DEFAULT_REVIEWER_MODEL,
    skillPath: SUPERVISOR_SKILL_PATH,
    mode: 'on-multi',
  },
  reconciliator: {
    model: DEFAULT_REVIEWER_MODEL,
    skillPath: RECONCILIATOR_SKILL_PATH,
    mode: 'on-conflict',
  },
  fixerModel: DEFAULT_FIXER_MODEL,
  maxLoops: DEFAULT_DEPTH,
  deadlock: { flipThreshold: 2, action: 'escalate' },
});

/**
 * Whether this config should run the supervisor LLM for the current roster.
 * @param {LoopConfig} config Loop config
 * @returns True when brief + aggregate should run
 */
export const usesSupervisor = (config: LoopConfig): boolean => {
  if (config.supervisor.mode === 'always') return true;
  if (config.supervisor.mode === 'never') return false;
  return config.reviewers.length > 1;
};

export interface ResolveConfigInput {
  readonly configPath: string;
  readonly reviewerIds: readonly string[];
  readonly reviewerModel: string | undefined;
  readonly fixerModel: string | undefined;
  readonly maxLoops: number | undefined;
  readonly cwd: string;
  readonly supervisorModel?: string | undefined;
  readonly supervisorMode?: SupervisorMode | undefined;
}

/**
 * Narrows unknown to a non-empty string.
 * @param {unknown} value Candidate value
 * @returns The string, or undefined
 */
const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Narrows unknown to a finite number.
 * @param {unknown} value Candidate value
 * @returns The number, or undefined
 */
const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Resolves a skill path from a config entry (absolute path, skill name, or default).
 * @param {string | undefined} skill Skill directory name
 * @param {string | undefined} skillPath Absolute or relative skill file path
 * @param {string} fallback Absolute fallback SKILL.md path
 * @param {string} cwd Working directory for relative paths
 * @returns The absolute skill path
 */
const resolveSkillPath = (
  skill: string | undefined,
  skillPath: string | undefined,
  fallback: string,
  cwd: string,
): string => {
  if (skillPath !== undefined) {
    return skillPath.startsWith('/') ? skillPath : `${cwd}/${skillPath}`;
  }
  if (skill !== undefined) {
    return `${cwd}/.agents/skills/${skill}/SKILL.md`;
  }
  return fallback;
};

/**
 * Builds a reviewer profile from a config-file entry, falling back to builtins.
 * @param {FileReviewerEntry} entry Config file reviewer entry
 * @param {string} cwd Working directory
 * @param {string | undefined} modelOverride Global reviewer model override
 * @returns The resolved profile, or an error message
 */
const profileFromFileEntry = (
  entry: FileReviewerEntry,
  cwd: string,
  modelOverride: string | undefined,
): ReviewerProfile | string => {
  const id = asNonEmptyString(entry.id);
  if (id === undefined) return 'Reviewer entry is missing a non-empty id';

  const builtin = BUILTIN_REVIEWERS[id];
  const label = asNonEmptyString(entry.label) ?? builtin?.label ?? id;
  const model =
    modelOverride ??
    asNonEmptyString(entry.model) ??
    builtin?.defaultModel ??
    DEFAULT_REVIEWER_MODEL;
  const objective =
    asNonEmptyString(entry.objective) ??
    asNonEmptyString(entry.focus) ??
    builtin?.objective ??
    `adversarial review focused on ${id}`;
  const skillPath = resolveSkillPath(
    asNonEmptyString(entry.skill),
    asNonEmptyString(entry.skillPath),
    builtin?.skillPath ?? REVIEWER_SKILL_PATH,
    cwd,
  );

  return makeReviewerProfile({ id, label, model, skillPath, objective });
};

/**
 * Loads and parses a JSON config file from disk.
 * @param {string} configPath Absolute path to the config file
 * @returns The parsed config file object
 */
const loadConfigFile = (
  configPath: string,
): Effect.Effect<FileConfig, ConfigError, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const exists = yield* fileSystem.exists(configPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* Effect.fail(
        new ConfigError({ message: `Config file not found: ${configPath}` }),
      );
    }

    const text = yield* fileSystem.readFileString(configPath, 'utf8').pipe(
      Effect.mapError(
        (cause) => new ConfigError({ message: `Failed to read config: ${cause.message}` }),
      ),
    );

    try {
      const json: unknown = JSON.parse(text);
      if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        return yield* Effect.fail(
          new ConfigError({ message: `Config root must be a JSON object: ${configPath}` }),
        );
      }
      return json as FileConfig;
    } catch (error) {
      return yield* Effect.fail(
        new ConfigError({
          message: `Invalid JSON in config file: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  });

/**
 * Resolves reviewer profiles from builtin ids.
 * @param {readonly string[]} ids Reviewer ids
 * @param {string | undefined} modelOverride Global reviewer model override
 * @returns Resolved profiles, or an error message
 */
const profilesFromIds = (
  ids: readonly string[],
  modelOverride: string | undefined,
): readonly ReviewerProfile[] | string => {
  const profiles: ReviewerProfile[] = [];
  for (const rawId of ids) {
    const id = rawId.trim();
    if (id === '') continue;
    const builtin = BUILTIN_REVIEWERS[id];
    if (builtin === undefined) {
      return (
        `Unknown reviewer id '${id}'. Built-ins: ${Object.keys(BUILTIN_REVIEWERS).join(', ')}. ` +
        'Provide a --config file for custom reviewers.'
      );
    }
    profiles.push(
      makeReviewerProfile({
        id: builtin.id,
        label: builtin.label,
        model: modelOverride ?? builtin.defaultModel,
        skillPath: builtin.skillPath,
        objective: builtin.objective,
      }),
    );
  }
  if (profiles.length === 0) {
    return '`--reviewers` must list at least one reviewer id';
  }
  return profiles;
};

/**
 * Parses a reconcile mode string.
 * @param {unknown} value Raw mode value
 * @returns The mode, or undefined when absent/invalid
 */
const parseReconcileMode = (value: unknown): ReconcileMode | undefined => {
  if (value === 'on-conflict' || value === 'always' || value === 'never') return value;
  return undefined;
};

/**
 * Parses a supervisor mode string.
 * @param {unknown} value Raw mode value
 * @returns The mode, or undefined when absent/invalid
 */
export const parseSupervisorMode = (value: unknown): SupervisorMode | undefined => {
  if (value === 'on-multi' || value === 'always' || value === 'never') return value;
  return undefined;
};

/**
 * Pure config resolution against an optional already-loaded file object.
 * @param {ResolveConfigInput} input CLI inputs
 * @param {FileConfig | undefined} file Optional parsed config file
 * @returns Resolved config or an error message
 */
export const resolveLoopConfigPure = (
  input: ResolveConfigInput,
  file: FileConfig | undefined,
): LoopConfig | string => {
  const base = defaultLoopConfig();
  let reviewers: readonly ReviewerProfile[];

  if (input.reviewerIds.length > 0) {
    const fromIds = profilesFromIds(input.reviewerIds, input.reviewerModel);
    if (typeof fromIds === 'string') return fromIds;
    reviewers = fromIds;
  } else if (file?.reviewers !== undefined && file.reviewers.length > 0) {
    const resolved: ReviewerProfile[] = [];
    for (const entry of file.reviewers) {
      const profile = profileFromFileEntry(entry, input.cwd, input.reviewerModel);
      if (typeof profile === 'string') return profile;
      resolved.push(profile);
    }
    reviewers = resolved;
  } else {
    reviewers = [genericReviewer(input.reviewerModel ?? DEFAULT_REVIEWER_MODEL)];
  }

  // Duplicate ids are invalid: they silently activate the supervisor
  // (on-multi), clobber scratch files, and collide widget rows.
  const seenIds = new Set<string>();
  for (const profile of reviewers) {
    if (seenIds.has(profile.id)) {
      return `Duplicate reviewer id '${profile.id}' — each reviewer must have a unique id.`;
    }
    seenIds.add(profile.id);
  }

  if (input.reviewerModel !== undefined) {
    const model = input.reviewerModel;
    reviewers = reviewers.map((profile) => ({ ...profile, model }));
  }

  const fixerModel =
    input.fixerModel ??
    asNonEmptyString(file?.fixer?.model) ??
    asNonEmptyString(file?.fixerModel) ??
    base.fixerModel;

  const maxLoops = input.maxLoops ?? asFiniteNumber(file?.maxLoops) ?? base.maxLoops;
  if (!Number.isInteger(maxLoops) || maxLoops < 1) {
    return `maxLoops must be a positive integer, got: ${maxLoops}`;
  }

  const flipThreshold =
    asFiniteNumber(file?.deadlock?.flipThreshold) ?? base.deadlock.flipThreshold;
  if (!Number.isInteger(flipThreshold) || flipThreshold < 1) {
    return `deadlock.flipThreshold must be a positive integer, got: ${flipThreshold}`;
  }

  if (
    file?.reconciliator?.mode !== undefined &&
    parseReconcileMode(file.reconciliator.mode) === undefined
  ) {
    return `reconciliator.mode must be on-conflict|always|never, got: ${String(file.reconciliator.mode)}`;
  }

  if (
    file?.supervisor?.mode !== undefined &&
    parseSupervisorMode(file.supervisor.mode) === undefined
  ) {
    return `supervisor.mode must be on-multi|always|never, got: ${String(file.supervisor.mode)}`;
  }

  if (
    input.supervisorMode !== undefined &&
    parseSupervisorMode(input.supervisorMode) === undefined
  ) {
    return `supervisor.mode must be on-multi|always|never, got: ${String(input.supervisorMode)}`;
  }

  const reconciliatorMode =
    parseReconcileMode(file?.reconciliator?.mode) ?? base.reconciliator.mode;
  const reconciliatorModel =
    asNonEmptyString(file?.reconciliator?.model) ??
    input.reviewerModel ??
    base.reconciliator.model;
  const reconciliatorSkillPath = resolveSkillPath(
    asNonEmptyString(file?.reconciliator?.skill),
    asNonEmptyString(file?.reconciliator?.skillPath),
    RECONCILIATOR_SKILL_PATH,
    input.cwd,
  );

  const supervisorMode =
    input.supervisorMode ??
    parseSupervisorMode(file?.supervisor?.mode) ??
    base.supervisor.mode;
  const supervisorModel =
    input.supervisorModel ??
    asNonEmptyString(file?.supervisor?.model) ??
    input.reviewerModel ??
    base.supervisor.model;
  const supervisorSkillPath = resolveSkillPath(
    asNonEmptyString(file?.supervisor?.skill),
    asNonEmptyString(file?.supervisor?.skillPath),
    SUPERVISOR_SKILL_PATH,
    input.cwd,
  );

  return {
    reviewers,
    supervisor: {
      model: supervisorModel,
      skillPath: supervisorSkillPath,
      mode: supervisorMode,
    },
    reconciliator: {
      model: reconciliatorModel,
      skillPath: reconciliatorSkillPath,
      mode: reconciliatorMode,
    },
    fixerModel,
    maxLoops,
    deadlock: {
      flipThreshold,
      action: 'escalate',
    },
  };
};

/**
 * Resolves the effective loop config from defaults, optional file, and CLI overrides.
 * Models never decide loop control — this config only names who runs and with which model.
 * @param {ResolveConfigInput} input CLI/file inputs
 * @returns The effective loop configuration
 */
export const resolveLoopConfig = (
  input: ResolveConfigInput,
): Effect.Effect<LoopConfig, ConfigError, FileSystem> =>
  Effect.gen(function* () {
    let file: FileConfig | undefined;

    if (input.configPath !== '') {
      const path = input.configPath.startsWith('/')
        ? input.configPath
        : `${input.cwd}/${input.configPath}`;
      file = yield* loadConfigFile(path);
    }

    const resolved = resolveLoopConfigPure(input, file);
    if (typeof resolved === 'string') {
      return yield* Effect.fail(new ConfigError({ message: resolved }));
    }
    return resolved;
  });
