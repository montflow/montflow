import {
  REVIEWER_SKILL_PATH,
  SUPERVISOR_SKILL_PATH,
} from './skill-paths';

/**
 * Pi extended-thinking level for an agent role: `off` disables thinking,
 * `minimal`…`max` scale the reasoning effort. The level is clamped to the
 * model's capabilities by pi at session creation (`thinkingLevelMap`), so an
 * unsupported level never fails the run — it silently maps to the nearest
 * supported one. Omitted (undefined) means "pi default" (`medium` clamped to
 * the model).
 */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ReviewerProfile {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  /** Optional ordered fallback models tried after `model` fails (rate limits, overloads). */
  readonly fallbackModels?: readonly string[];
  /**
   * Optional extended-thinking level for this reviewer's sessions. Omitted =
   * pi default (medium clamped to the model).
   */
  readonly thinkingLevel?: ThinkingLevel;
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
  /** Optional ordered fallback models tried after `model` fails. */
  readonly fallbackModels?: readonly string[];
  /**
   * Optional extended-thinking level for the supervisor's sessions (brief +
   * aggregate both inherit it). Omitted = pi default (medium clamped to the
   * model).
   */
  readonly thinkingLevel?: ThinkingLevel;
}

export interface DeadlockConfig {
  readonly flipThreshold: number;
  readonly action: 'escalate';
}

export interface LoopConfig {
  readonly reviewers: readonly ReviewerProfile[];
  readonly supervisor: SupervisorConfig;
  readonly fixerModel: string;
  /** Optional ordered fallback models tried after `fixerModel` fails. */
  readonly fixerFallbackModels?: readonly string[];
  /**
   * Optional extended-thinking level for every fixer session. Omitted = pi
   * default (medium clamped to the model).
   */
  readonly fixerThinkingLevel?: ThinkingLevel;
  /** How many independent reviewer **loops** to run (each spawns a fresh set of reviewers). */
  readonly maxLoops: number;
  /** Max **cycles** per loop — the same reviewers re-review the updated code up to this many times. */
  readonly maxCycles: number;
  /** How many reviewer/fixer agents may run concurrently (1 = sequential). */
  readonly agentConcurrency: number;
  /**
   * Per-turn supervisor budget in ms (brief AND aggregate each get this).
   * Optional for legacy configs/presets; defaults to
   * {@link DEFAULT_SUPERVISOR_TIMEOUT_MS} at use time.
   */
  readonly supervisorTimeoutMs?: number;
  readonly deadlock: DeadlockConfig;
}

export const DEFAULT_REVIEWER_MODEL = 'deepseek-v4-pro';

export const DEFAULT_FIXER_MODEL = 'deepseek-v4-flash-free';

/** Default number of loops (independent reviewer sets). */
export const DEFAULT_MAX_LOOPS = 3;

/** Default number of cycles per loop (same reviewers re-review up to this many times). */
export const DEFAULT_MAX_CYCLES = 5;

/** @deprecated Use {@link DEFAULT_MAX_CYCLES}. */
export const DEFAULT_DEPTH = DEFAULT_MAX_CYCLES;

/** Default parallel reviewer/fixer agents (reviewer fan-out + fixer waves). */
export const DEFAULT_AGENT_CONCURRENCY = 5;

/**
 * Default per-turn supervisor budget (brief AND aggregate each get this).
 * 20 minutes: the supervisor must read every reviewer's scratch file plus the
 * full findings/discussion state before writing the canonical review — the
 * old 10-minute cap was a common cause of aggregate timeouts on large reviews.
 */
export const DEFAULT_SUPERVISOR_TIMEOUT_MS = 1_200_000;

interface BuiltinReviewer {
  readonly id: string;
  readonly label: string;
  readonly defaultModel: string;
  readonly skillPath: string;
  readonly objective: string;
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
  readonly fallbackModels?: readonly string[];
  readonly thinkingLevel?: ThinkingLevel;
}): ReviewerProfile => ({
  id: input.id,
  label: input.label,
  model: input.model,
  fallbackModels: input.fallbackModels,
  thinkingLevel: input.thinkingLevel,
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

/** Built-in specialist profiles selectable as reviewers. */
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
 * Default loop config: single generic reviewer behind an always-on supervisor
 * (brief + aggregate) — aggregation is always agent-driven.
 * @returns The default loop configuration
 */
export const defaultLoopConfig = (): LoopConfig => ({
  reviewers: [genericReviewer()],
  supervisor: {
    model: DEFAULT_REVIEWER_MODEL,
    skillPath: SUPERVISOR_SKILL_PATH,
  },
  fixerModel: DEFAULT_FIXER_MODEL,
  maxLoops: DEFAULT_MAX_LOOPS,
  maxCycles: DEFAULT_MAX_CYCLES,
  agentConcurrency: DEFAULT_AGENT_CONCURRENCY,
  supervisorTimeoutMs: DEFAULT_SUPERVISOR_TIMEOUT_MS,
  deadlock: { flipThreshold: 2, action: 'escalate' },
});
