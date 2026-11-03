/**
 * The spec-level complexity tier: the one enum, its contract, and the split
 * verdict shape. Pure — no I/O. The `tier` verb and the authoring generators are
 * its only filesystem consumers.
 */

/** The three complexity tiers, smallest first. No default; a missing value is an error. */
export const TIERS = ['micro', 'standard', 'full'] as const;

/** One complexity tier. */
export type Tier = (typeof TIERS)[number];

/** Every tier name, for a diagnostic's `expected` row. */
export const TIER_HINT = TIERS.join(', ');

/** A verdict kind, never a tier value. `isTier(SPLIT)` is false. */
export const SPLIT = 'split';

/** True when `value` is one of the three tiers. */
export const isTier = (value: string): value is Tier => TIERS.some((tier) => tier === value);

/** Artifacts a tier may require; a closed union, so no free-form artifact name exists. */
export type TierArtifact =
  | 'SPEC.md'
  | 'PHASE.md'
  | 'TASK.md'
  | 'MEMORY.md'
  | 'GATES.md'
  | 'review-task'
  | 'BOARD.md'
  | 'MAILBOX.md';

/** The per-tier contract. Every field is a mechanical consequence of the tier. */
export interface TierContract {
  readonly tier: Tier;
  readonly minPhases: number;
  readonly maxPhases: number;
  /** Work tasks, excluding generated review tasks. */
  readonly maxTasks: number;
  /** Work tasks per phase, excluding generated review tasks. */
  readonly maxTasksPerPhase: number;
  readonly exploration: 'forbidden' | 'optional' | 'required';
  readonly gate: 'command-per-task' | 'per-task' | 'phase-and-task';
  readonly review: 'waived' | 'required';
  readonly waiver: 'permitted' | 'records-only' | 'forbidden';
  /** Maximum `ask_user` calls in one creation run; 0 means the run never asks. */
  readonly interaction: number;
  readonly grilling: 'forbidden' | 'not-loaded' | 'required';
  readonly artifacts: ReadonlyArray<TierArtifact>;
  readonly conditionalArtifacts: ReadonlyArray<TierArtifact>;
}

/** The one tier contract table. `init`, `new-task`, `waiver`, and `tier` read it. */
export const TIER_CONTRACT = {
  micro: {
    tier: 'micro',
    minPhases: 1,
    maxPhases: 1,
    maxTasks: 2,
    maxTasksPerPhase: 2,
    exploration: 'forbidden',
    gate: 'command-per-task',
    review: 'waived',
    waiver: 'permitted',
    interaction: 0,
    grilling: 'forbidden',
    artifacts: ['SPEC.md', 'PHASE.md', 'TASK.md', 'MEMORY.md', 'GATES.md'],
    conditionalArtifacts: [],
  },
  standard: {
    tier: 'standard',
    minPhases: 1,
    maxPhases: 2,
    maxTasks: 6,
    maxTasksPerPhase: 4,
    exploration: 'optional',
    gate: 'per-task',
    review: 'required',
    waiver: 'records-only',
    interaction: 2,
    grilling: 'not-loaded',
    artifacts: [
      'SPEC.md',
      'PHASE.md',
      'TASK.md',
      'MEMORY.md',
      'GATES.md',
      'review-task',
      'BOARD.md',
    ],
    conditionalArtifacts: ['MAILBOX.md'],
  },
  full: {
    tier: 'full',
    minPhases: 2,
    maxPhases: 4,
    maxTasks: 12,
    maxTasksPerPhase: 6,
    exploration: 'required',
    gate: 'phase-and-task',
    review: 'required',
    waiver: 'forbidden',
    interaction: 8,
    grilling: 'required',
    artifacts: [
      'SPEC.md',
      'PHASE.md',
      'TASK.md',
      'MEMORY.md',
      'GATES.md',
      'review-task',
      'BOARD.md',
      'MAILBOX.md',
    ],
    conditionalArtifacts: [],
  },
} satisfies Record<Tier, TierContract>;

/** Stable codes for the tier drift and load rules. */
export const CODES = {
  unknownTier: 'tier.unknown',
  missingFile: 'tier.missing',
  staleFile: 'tier.stale',
  waiverForbidden: 'tier.waiver-forbidden',
} as const;

/** The exact field names a split verdict carries; no extra key is valid. */
export const SPLIT_FIELDS = [
  'verdict',
  'cut',
  'count',
  'specs',
  'slug',
  'tier',
  'scope',
  'evidence',
] as const;

/** Task types that count as code or record work, so a `records-only` phase cannot waive. */
const RECORD_WORK_TYPES = new Set(['execution', 'defect', 'interruptor']);

/**
 * True when a phase at `tier` may declare `review: waived` given its task types.
 * `micro` is exempt from the `records-only` predicate: the appraiser may waive
 * any micro phase by default and may upgrade one to required. `standard` may
 * waive only a phase whose tasks are all planning/exploratory/review. `full`
 * never waives.
 * @param tier - the spec's tier
 * @param taskTypes - every task type in the phase
 * @returns whether the waiver policy permits the decision
 */
export const waiverAllowed = (tier: Tier, taskTypes: ReadonlyArray<string>): boolean => {
  if (tier === 'full') return false;
  if (tier === 'micro') return true;
  return !taskTypes.some((type) => RECORD_WORK_TYPES.has(type));
};

/**
 * The tier a spec declares in its `## Creation` section, when one is present.
 * No tier is stored in frontmatter (B003 F2), so the body record is the only
 * place a read surface can learn it.
 * @param tier - a candidate value
 * @returns the tier, or undefined when absent or unknown
 */
export const tierOrUndefined = (tier: string | undefined): Tier | undefined =>
  tier !== undefined && isTier(tier) ? tier : undefined;
