import {
  REVIEWER_SKILL_PATH,
  SUPERVISOR_SKILL_PATH,
} from './skill-paths';

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
}

export interface DeadlockConfig {
  readonly flipThreshold: number;
  readonly action: 'escalate';
}

export interface LoopConfig {
  readonly reviewers: readonly ReviewerProfile[];
  readonly supervisor: SupervisorConfig;
  readonly fixerModel: string;
  /** How many independent reviewer **loops** to run (each spawns a fresh set of reviewers). */
  readonly maxLoops: number;
  /** Max **cycles** per loop — the same reviewers re-review the updated code up to this many times. */
  readonly maxCycles: number;
  /** How many reviewer/fixer agents may run concurrently (1 = sequential). */
  readonly agentConcurrency: number;
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
  deadlock: { flipThreshold: 2, action: 'escalate' },
});
