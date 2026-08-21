import type {
  PresetGroupReviewerEntry,
  PresetReviewerRef,
  PresetWorkflowStep,
} from '../protocol'

/**
 * The node vocabulary the pipeline palette offers. `kind` is what gets stored
 * in `step.kind` — the schema is deliberately loose, so steps hand-written
 * with other kinds still render (as generic nodes) and are never destroyed.
 */
export interface WorkflowNodeKind {
  kind: string
  label: string
  description: string
  /** Tailwind classes for the node badge (icon chip). */
  accent: string
}

export const WORKFLOW_NODE_KINDS: readonly WorkflowNodeKind[] = [
  {
    kind: 'reviewer',
    label: 'Reviewers',
    description: 'One adversarial reviewer',
    accent: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    kind: 'reviewer-group',
    label: 'Reviewer group',
    description: 'Several reviewers running in parallel (fan-out)',
    accent: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  },
  {
    kind: 'fixer',
    label: 'Fixers',
    description: 'Apply fixes for findings (fan-out waves)',
    accent: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
]

/**
 * The node vocabulary the LOOP palette offers. Same canvas as pipelines but
 * loop-shaped: reviewer groups/singles (aggregation is part of the group —
 * it always runs after it) and fixers.
 */
export const LOOP_NODE_KINDS: readonly WorkflowNodeKind[] = [
  {
    kind: 'reviewer-group',
    label: 'Reviewer group',
    description: 'Several reviewers in parallel — with concurrency and its aggregation model',
    accent: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  },
  {
    kind: 'reviewer',
    label: 'Reviewers',
    description: 'One adversarial reviewer',
    accent: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    kind: 'fixers',
    label: 'Fixers',
    description: 'Apply fixes for findings — with concurrency',
    accent: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
]

/** Palette entry lookup by kind (searches both vocabularies); undefined for unknown (hand-written) kinds. */
export const nodeKindOf = (kind: string): WorkflowNodeKind | undefined =>
  WORKFLOW_NODE_KINDS.find((k) => k.kind === kind) ??
  LOOP_NODE_KINDS.find((k) => k.kind === kind)

/** True when the step is a reviewer-group (a container for reviewer refs). */
export const isGroupStep = (step: PresetWorkflowStep): boolean => step.kind === 'reviewer-group'

/**
 * True when the step needs a model picker (aggregation is legacy — it was
 * folded into the reviewer-group; fixers/human take a model).
 */
export const isModelStep = (step: PresetWorkflowStep): boolean =>
  step.kind === 'aggregation' || step.kind === 'fixers' || step.kind === 'human'

/** True when the step has a concurrency control (reviewer-group / fixers). */
export const hasConcurrency = (step: PresetWorkflowStep): boolean =>
  isGroupStep(step) || step.kind === 'fixers'

/**
 * Error message when a step's inputs are incomplete; null = valid. A
 * `reviewer` step must have a picked reviewer WITH a model; a
 * `reviewer-group` must have at least one reviewer, each with a model;
 * `aggregation`/`fixers` need a model; `human` needs a model and the
 * prompt that presents data to the user.
 */
export const stepError = (step: PresetWorkflowStep): string | null => {
  if (typeof step !== 'object' || step === null) return 'Invalid step'
  if (step.kind === 'reviewer') {
    if (step.reviewer === undefined) return 'Select a reviewer'
    return (step.reviewer.model ?? '').trim() === '' ? 'Reviewer needs a model' : null
  }
  if (isGroupStep(step)) {
    const reviewers = step.reviewers ?? []
    if (reviewers.length === 0) return 'Add at least one reviewer'
    const missing = reviewers.findIndex(
      (entry) => (groupReviewerRef(entry).model ?? '').trim() === '',
    )
    return missing >= 0 ? `Reviewer ${missing + 1} needs a model` : null
  }
  if (step.kind === 'aggregation' || step.kind === 'fixers') {
    return (step.model ?? '').trim() === '' ? 'Select a model' : null
  }
  if (step.kind === 'human') {
    if ((step.model ?? '').trim() === '') return 'Select a model'
    if ((step.prompt ?? '').trim() === '') return 'Prompt required'
    return null
  }
  return null
}

/** Sets (or clears) the reviewer reference on a single `reviewer` step. */
export const setStepReviewer = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  ref: PresetReviewerRef | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) => (i === index ? { ...step, reviewer: ref } : step))

/** Sets (or clears) the model on an `aggregation` / `fixers` / `human` step. */
export const setStepModel = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  model: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === index
      ? {
          ...step,
          model,
          // A fallback without a primary is meaningless — clearing the model
          // drops whatever fallback would be left behind.
          fallbackModel:
            model === undefined
              ? undefined
              : step.fallbackModel === model
                ? undefined
                : step.fallbackModel,
        }
      : step,
  )

/** Sets (or clears) the single fallback model on a model step. */
export const setStepFallbackModel = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  fallbackModel: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === index ? { ...step, fallbackModel: fallbackModel === undefined ? undefined : fallbackModel } : step,
  )

/** Sets (or clears) the concurrency on a `reviewer-group` / `fixers` step. */
export const setStepConcurrency = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  concurrency: number | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) => (i === index ? { ...step, concurrency } : step))

/** Sets (or clears) the model override on a single `reviewer` step (keeps the pick). */
export const setStepReviewerModel = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  model: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) => {
    if (i !== index || step.reviewer === undefined) return step
    if (model === undefined) {
      return {
        ...step,
        reviewer: { type: step.reviewer.type, id: step.reviewer.id, name: step.reviewer.name },
      }
    }
    // The new primary can't double as the fallback — clear it.
    return {
      ...step,
      reviewer: {
        ...step.reviewer,
        model,
        fallbackModel: step.reviewer.fallbackModel === model ? undefined : step.reviewer.fallbackModel,
      },
    }
  })

/** Sets (or clears) the single fallback model on a single reviewer step's ref. */
export const setStepReviewerFallbackModel = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  fallbackModel: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) => {
    if (i !== index || step.reviewer === undefined) return step
    return {
      ...step,
      reviewer: { ...step.reviewer, fallbackModel },
    }
  })

/** Extracts the reviewer reference from a roster entry (bare ref or { reviewer, prompt? }). */
export const groupReviewerRef = (entry: PresetGroupReviewerEntry): PresetReviewerRef =>
  'reviewer' in entry ? entry.reviewer : entry

/** Extracts the per-reviewer prompt from a roster entry (undefined when absent). */
export const groupReviewerPrompt = (entry: PresetGroupReviewerEntry): string | undefined =>
  'reviewer' in entry ? entry.prompt : undefined

/** Adds a reviewer reference to the END of a reviewer-group's roster. */
export const addReviewerToGroup = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  ref: PresetReviewerRef,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === groupIndex ? { ...step, reviewers: [...(step.reviewers ?? []), { reviewer: ref }] } : step,
  )

/** Removes one reviewer reference from a reviewer-group step. */
export const removeReviewerFromGroup = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  reviewerIndex: number,
): PresetWorkflowStep[] =>
  steps.map((step, i) => {
    if (i !== groupIndex || step.reviewers === undefined) return step
    const reviewers = step.reviewers.filter((_, ri) => ri !== reviewerIndex)
    return reviewers.length === 0 ? { ...step, reviewers: undefined } : { ...step, reviewers }
  })

/** Replaces one reviewer reference inside a reviewer-group's roster (keeps its prompt). */
export const setGroupReviewer = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  reviewerIndex: number,
  ref: PresetReviewerRef,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === groupIndex
      ? {
          ...step,
          reviewers: (step.reviewers ?? []).map((entry, ri) =>
            ri === reviewerIndex ? { reviewer: ref, prompt: groupReviewerPrompt(entry) } : entry,
          ),
        }
      : step,
  )

/** Sets (or clears) the prompt on one reviewer inside a reviewer-group. */
export const setGroupReviewerPrompt = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  reviewerIndex: number,
  prompt: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === groupIndex
      ? {
          ...step,
          reviewers: (step.reviewers ?? []).map((entry, ri) =>
            ri === reviewerIndex
              ? prompt === undefined
                ? { reviewer: groupReviewerRef(entry) }
                : { reviewer: groupReviewerRef(entry), prompt }
              : entry,
          ),
        }
      : step,
  )

/** Sets (or clears) the model override on one reviewer inside a group (keeps pick + prompt). */
export const setGroupReviewerModel = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  reviewerIndex: number,
  model: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === groupIndex
      ? {
          ...step,
          reviewers: (step.reviewers ?? []).map((entry, ri) => {
            if (ri !== reviewerIndex) return entry
            const ref = groupReviewerRef(entry)
            if (model === undefined) {
              return {
                reviewer: { type: ref.type, id: ref.id, name: ref.name },
                prompt: groupReviewerPrompt(entry),
              }
            }
            // The new primary can't double as the fallback — clear it.
            const fallbackModel = ref.fallbackModel === model ? undefined : ref.fallbackModel
            return {
              reviewer: {
                ...ref,
                model,
                fallbackModel,
              },
              prompt: groupReviewerPrompt(entry),
            }
          }),
        }
      : step,
  )

/** Sets (or clears) the single fallback model on one roster entry's ref (keeps the wrapper shape). */
export const setGroupReviewerFallbackModel = (
  steps: readonly PresetWorkflowStep[],
  groupIndex: number,
  reviewerIndex: number,
  fallbackModel: string | undefined,
): PresetWorkflowStep[] =>
  steps.map((step, i) =>
    i === groupIndex
      ? {
          ...step,
          reviewers: (step.reviewers ?? []).map((entry, ri) => {
            if (ri !== reviewerIndex) return entry
            const ref = groupReviewerRef(entry)
            return {
              reviewer: {
                ...ref,
                fallbackModel: fallbackModel === undefined ? undefined : fallbackModel,
              },
              prompt: groupReviewerPrompt(entry),
            }
          }),
        }
      : step,
  )

/** Short display label for a reviewer reference (builtin id or profile name). */
export const reviewerRefLabel = (ref: PresetReviewerRef): string =>
  ref.type === 'builtin' ? (ref.id ?? '?') : (ref.name ?? '?')

// --- Immutable step-list mutations (kept pure for easy testing) ---

/** Next free `s<n>` id (highest existing numeric suffix + 1, stable across reorders). */
export const nextStepId = (steps: readonly PresetWorkflowStep[]): string => {
  let max = 0
  for (const step of steps) {
    const match = /^s(\d+)$/.exec(step.id)
    if (match !== null) max = Math.max(max, parseInt(match[1] ?? '0', 10))
  }
  return `s${max + 1}`
}

/** Builds a new step for a kind with the next free id. */
export const createStep = (
  steps: readonly PresetWorkflowStep[],
  kind: string,
  label?: string,
): PresetWorkflowStep => ({ id: nextStepId(steps), kind, label })

/** Appends a step to the end of the pipeline. */
export const appendStep = (
  steps: readonly PresetWorkflowStep[],
  step: PresetWorkflowStep,
): PresetWorkflowStep[] => [...steps, step]

/** Inserts a step at a clamped index (0…length). */
export const insertStepAt = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  step: PresetWorkflowStep,
): PresetWorkflowStep[] => {
  const at = Math.max(0, Math.min(index, steps.length))
  return [...steps.slice(0, at), step, ...steps.slice(at)]
}

/** Removes the step at a clamped index. */
export const removeStepAt = (
  steps: readonly PresetWorkflowStep[],
  index: number,
): PresetWorkflowStep[] => [...steps.slice(0, index), ...steps.slice(index + 1)]

/** Applies a patch to one step (used for label/params edits). */
export const updateStep = (
  steps: readonly PresetWorkflowStep[],
  index: number,
  patch: Partial<Pick<PresetWorkflowStep, 'label' | 'params' | 'kind' | 'prompt'>>,
): PresetWorkflowStep[] =>
  steps.map((step, i) => (i === index ? { ...step, ...patch } : step))

/** Moves a step from one index to another (dnd-kit arrayMove semantics). */
export const moveStep = (
  steps: readonly PresetWorkflowStep[],
  from: number,
  to: number,
): PresetWorkflowStep[] => {
  if (from === to) return [...steps]
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return next
  next.splice(to, 0, moved)
  return next
}
