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
export const SUPERVISOR_MODES = ['on-multi', 'always', 'never'] as const;

export type SupervisorMode = (typeof SUPERVISOR_MODES)[number];

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
