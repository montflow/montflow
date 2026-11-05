/**
 * The spec-level rigor ladder: the one enum, its contract, and the split
 * verdict shape. Pure — no I/O. The `rigor` verb and the authoring generators
 * are its only filesystem consumers.
 */

/** The five rigor levels, smallest first. No default; a missing value is an error. */
export const RIGORS = ['trivial', 'light', 'standard', 'deep', 'critical'] as const;

/** One rigor level. */
export type Rigor = (typeof RIGORS)[number];

/** Every rigor name, for a diagnostic's `expected` row. */
export const RIGOR_HINT = RIGORS.join(', ');

/** A verdict kind, never a rigor value. `isRigor(SPLIT)` is false. */
export const SPLIT = 'split';

/** True when `value` is one of the five rigor levels. */
export const isRigor = (value: string): value is Rigor => RIGORS.some((rigor) => rigor === value);

/** Artifacts a rigor level may require; a closed union, so no free-form artifact name exists. */
export type RigorArtifact =
  | 'SPEC.md'
  | 'PHASE.md'
  | 'TASK.md'
  | 'MEMORY.md'
  | 'GATES.md'
  | 'review-task'
  | 'BOARD.md'
  | 'MAILBOX.md';

/** The per-rigor contract. Every field is a mechanical consequence of the level. */
export interface RigorContract {
  readonly rigor: Rigor;
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
  readonly artifacts: ReadonlyArray<RigorArtifact>;
  readonly conditionalArtifacts: ReadonlyArray<RigorArtifact>;
}

/** The one rigor contract table. `init`, `new-task`, `waiver`, and `rigor` read it. */
export const RIGOR_CONTRACT = {
  trivial: {
    rigor: 'trivial',
    minPhases: 1,
    maxPhases: 1,
    maxTasks: 2,
    maxTasksPerPhase: 2,
    exploration: 'forbidden',
    gate: 'command-per-task',
    review: 'waived',
    waiver: 'permitted',
    interaction: 0,
    artifacts: ['SPEC.md', 'PHASE.md', 'TASK.md', 'MEMORY.md', 'GATES.md'],
    conditionalArtifacts: [],
  },
  light: {
    rigor: 'light',
    minPhases: 1,
    maxPhases: 1,
    maxTasks: 4,
    maxTasksPerPhase: 4,
    exploration: 'optional',
    gate: 'per-task',
    review: 'waived',
    waiver: 'permitted',
    interaction: 1,
    artifacts: ['SPEC.md', 'PHASE.md', 'TASK.md', 'MEMORY.md', 'GATES.md'],
    conditionalArtifacts: ['review-task', 'BOARD.md', 'MAILBOX.md'],
  },
  standard: {
    rigor: 'standard',
    minPhases: 1,
    maxPhases: 2,
    maxTasks: 6,
    maxTasksPerPhase: 4,
    exploration: 'optional',
    gate: 'per-task',
    review: 'required',
    waiver: 'records-only',
    interaction: 2,
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
  deep: {
    rigor: 'deep',
    minPhases: 2,
    maxPhases: 3,
    maxTasks: 9,
    maxTasksPerPhase: 5,
    exploration: 'required',
    gate: 'phase-and-task',
    review: 'required',
    waiver: 'records-only',
    interaction: 4,
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
  critical: {
    rigor: 'critical',
    minPhases: 2,
    maxPhases: 4,
    maxTasks: 12,
    maxTasksPerPhase: 6,
    exploration: 'required',
    gate: 'phase-and-task',
    review: 'required',
    waiver: 'forbidden',
    interaction: 8,
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
} satisfies Record<Rigor, RigorContract>;

/** Stable codes for the rigor drift and load rules. */
export const CODES = {
  unknownRigor: 'rigor.unknown',
  missingFile: 'rigor.missing',
  staleFile: 'rigor.stale',
  waiverForbidden: 'rigor.waiver-forbidden',
  reviewForbidden: 'rigor.review-forbidden',
  ceilingExceeded: 'rigor.ceiling-exceeded',
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
 * True when a phase at `rigor` may declare `review: waived` given its task types.
 * `trivial` and `light` are exempt from the `records-only` predicate: the
 * appraiser may waive any phase at those levels by default and may upgrade one to
 * required. `standard` and `deep` may waive only a phase whose tasks are all
 * planning/exploratory/review. `critical` never waives.
 * @param rigor - the spec's rigor level
 * @param taskTypes - every task type in the phase
 * @returns whether the waiver policy permits the decision
 */
export const waiverAllowed = (rigor: Rigor, taskTypes: ReadonlyArray<string>): boolean => {
  const policy = RIGOR_CONTRACT[rigor].waiver;
  if (policy === 'forbidden') return false;
  if (policy === 'permitted') return true;
  return !taskTypes.some((type) => RECORD_WORK_TYPES.has(type));
};

/**
 * True when a rigor writes one phase artifact. An artifact in `artifacts` is
 * unconditional; one in `conditionalArtifacts` appears only when the phase
 * holds more than one work task. The generator reads the contract here instead
 * of restating `light`/`standard`/`deep` by name.
 * @param contract - the rigor's contract row
 * @param artifact - the artifact to test
 * @param workTaskCount - non-review task count in the phase
 * @returns whether the artifact belongs in the tree
 */
export const writesArtifact = (
  contract: RigorContract,
  artifact: RigorArtifact,
  workTaskCount: number,
): boolean =>
  contract.artifacts.includes(artifact) ||
  (contract.conditionalArtifacts.includes(artifact) && workTaskCount > 1);

/**
 * The rigor a spec declares in its `## Creation` section, when one is present.
 * No rigor is stored in frontmatter (B003 F2), so the body record is the only
 * place a read surface can learn it.
 * @param rigor - a candidate value
 * @returns the rigor, or undefined when absent or unknown
 */
export const rigorOrUndefined = (rigor: string | undefined): Rigor | undefined =>
  rigor !== undefined && isRigor(rigor) ? rigor : undefined;
