import { useEffect, useState } from 'react'
import { Repeat, UsersRound, Wrench, Gavel, GitMerge, NotebookPen } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PresetLoopConfig, PresetWorkflowStep } from '@/protocol'
import { ReviewerPicker } from '@/components/ReviewerPicker'
import { ModelSelect } from '@/components/ModelSelect'
import { ConcurrencyField, FallbackModelsPicker } from '@/components/WorkflowEditor'
import { InfoTip } from '@/components/ui/tooltip'
import {
  addReviewerToGroup,
  groupReviewerPrompt,
  groupReviewerRef,
  setGroupReviewer,
  setGroupReviewerFallbackModel,
  setGroupReviewerModel,
  setGroupReviewerPrompt,
  setStepConcurrency,
} from '@/lib/workflow'

interface LoopEditorProps {
  value: PresetLoopConfig
  onChange: (config: PresetLoopConfig) => void
  /** For the reviewer picklist (workspace profiles). */
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
}

/**
 * Fixed-form editor for LOOP presets — deliberately NOT drag-and-drop. The
 * loop structure is always the same: a reviewer group (fan-out + aggregation)
 * and a fixers wave, plus model pickers for each reviewer, the aggregation,
 * the fixers, and the supervisor verdict turn. Only models, reviewers, and
 * counts are editable — never the shape.
 *
 * The config stays a `steps` array under the hood; this editor normalizes it
 * to the canonical `[reviewer-group, fixers]` pair on every change. Extra
 * hand-written steps in legacy files are dropped on save from this editor
 * (the JSON view still shows them until then).
 */
export function LoopEditor({ value, onChange, workspaceId, conn }: LoopEditorProps) {
  const groupIndex = value.steps.findIndex((s) => s.kind === 'reviewer-group')
  const fixersIndex = value.steps.findIndex((s) => s.kind === 'fixers')
  const group = groupIndex >= 0 ? value.steps[groupIndex] : undefined
  const fixers = fixersIndex >= 0 ? value.steps[fixersIndex] : undefined

  // Canonical steps on every change — the stored file always matches the
  // fixed form. Missing sections simply stay absent until added.
  const commit = (groupNext: PresetWorkflowStep | undefined, fixersNext: PresetWorkflowStep | undefined): void =>
    onChange({ ...value, steps: [groupNext, fixersNext].filter((s) => s !== undefined) })

  const patchGroup = (patch: Partial<PresetWorkflowStep>): void => {
    if (group === undefined) return
    commit({ ...group, ...patch }, fixers)
  }
  const patchFixers = (patch: Partial<PresetWorkflowStep>): void => {
    if (fixers === undefined) return
    commit(group, { ...fixers, ...patch })
  }

  const addGroup = (): void => {
    const step: PresetWorkflowStep = { id: nextId(value.steps), kind: 'reviewer-group', label: 'Reviewers' }
    commit(step, fixers)
  }
  const addFixers = (): void => {
    const step: PresetWorkflowStep = { id: nextId(value.steps), kind: 'fixers', label: 'Fix' }
    commit(group, step)
  }

  return (
    <div className="flex flex-col gap-3">
      <ExecutionBar value={value} onChange={onChange} />
      <SupervisorCard
        supervisor={value.supervisor ?? {}}
        onChange={(supervisor) => onChange({ ...value, supervisor })}
        conn={conn}
      />
      <AggregatorCard
        group={group}
        onAddGroup={addGroup}
        onPatchGroup={patchGroup}
        conn={conn}
      />
      <BookkeeperCard
        bookkeeper={value.bookkeeper ?? {}}
        onChange={(bookkeeper) => onChange({ ...value, bookkeeper })}
        conn={conn}
      />
      <ReviewerGroupCard
        group={group}
        onAdd={addGroup}
        onPatch={patchGroup}
        workspaceId={workspaceId}
        conn={conn}
      />
      <FixersCard fixers={fixers} onAdd={addFixers} onPatch={patchFixers} conn={conn} />
    </div>
  )
}

/** Next free `s<n>` id for a canonical step (mirrors workflow.ts's nextStepId). */
const nextId = (steps: readonly PresetWorkflowStep[]): string => {
  let max = 0
  for (const step of steps) {
    const match = /^s(\d+)$/.exec(step.id)
    if (match !== null) max = Math.max(max, parseInt(match[1] ?? '0', 10))
  }
  return `s${max + 1}`
}

/** Shared card chrome for each fixed section of the loop. */
function SectionCard({
  icon,
  title,
  description,
  missing,
  onAdd,
  addLabel,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  /** True when the section's step is absent from the config. */
  missing?: boolean
  onAdd?: () => void
  addLabel?: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400">
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="hidden truncate text-[10px] text-muted-foreground/60 sm:block">{description}</span>
      </div>
      {missing ? (
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-md border border-dashed border-input px-2 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {addLabel ?? 'Add section'}
        </button>
      ) : (
        children
      )}
    </div>
  )
}

/** The reviewer fan-out group: roster with per-reviewer models + aggregation. */
function ReviewerGroupCard({
  group,
  onAdd,
  onPatch,
  workspaceId,
  conn,
}: {
  group: PresetWorkflowStep | undefined
  onAdd: () => void
  onPatch: (patch: Partial<PresetWorkflowStep>) => void
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
}) {
  if (group === undefined) {
    return (
      <SectionCard
        icon={<UsersRound className="size-3.5" />}
        title="Reviewer group"
        description="Several reviewers in parallel, then one aggregation turn"
        missing
        onAdd={onAdd}
        addLabel="Add the reviewer group"
      />
    )
  }
  const reviewers = group.reviewers ?? []
  return (
    <SectionCard
      icon={<UsersRound className="size-3.5" />}
      title="Reviewer group"
      description="Several reviewers in parallel, then one aggregation turn"
    >
      <div className="flex flex-col gap-1.5">
        {reviewers.map((entry, reviewerIndex) => (
          <div key={reviewerIndex} className="rounded-md border bg-card p-1.5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Reviewer</label>
                <InfoTip text="The agent that performs this review — a builtin reviewer or a workspace profile." />
                <button
                  type="button"
                  onClick={() => {
                    const next = removeEntry(reviewers, reviewerIndex)
                    onPatch({ reviewers: next.length > 0 ? next : undefined })
                  }}
                  title="Remove reviewer"
                  aria-label="Remove reviewer"
                  className="ml-auto rounded p-1 text-muted-foreground/50 transition-colors hover:text-red-500"
                >
                  ×
                </button>
              </div>
              <ReviewerPicker
                workspaceId={workspaceId}
                conn={conn}
                value={groupReviewerRef(entry)}
                onChange={(next) =>
                  onPatch({
                    reviewers: setGroupReviewer(allSteps(group), 0, reviewerIndex, {
                      ...next,
                      model: groupReviewerRef(entry).model,
                    })[0]?.reviewers,
                  })
                }
              />
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Model <span className="text-rose-400">(required)</span>
                  </label>
                  <InfoTip text="Model for this reviewer — required. Every reviewer runs on a pinned model." />
                </div>
                <ModelSelect
                  conn={conn}
                  value={groupReviewerRef(entry).model ?? null}
                  onChange={(model) =>
                    onPatch({
                      reviewers: setGroupReviewerModel(allSteps(group), 0, reviewerIndex, model === null ? undefined : model)[0]?.reviewers,
                    })
                  }
                  hideDefault
                />
                <FallbackModelsPicker
                  conn={conn}
                  value={groupReviewerRef(entry).fallbackModel}
                  onChange={(fallbackModel) =>
                    onPatch({
                      reviewers: setGroupReviewerFallbackModel(allSteps(group), 0, reviewerIndex, fallbackModel)[0]?.reviewers,
                    })
                  }
                  primary={groupReviewerRef(entry).model}
                  label="Fallback reviewer models"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                  <InfoTip text="Optional extra instructions for this reviewer — appended to its task." />
                </div>
                <textarea
                  autoComplete="off"
                  value={groupReviewerPrompt(entry) ?? ''}
                  onChange={(event) =>
                    onPatch({
                      reviewers: setGroupReviewerPrompt(allSteps(group), 0, reviewerIndex, event.target.value === '' ? undefined : event.target.value)[0]?.reviewers,
                    })
                  }
                  placeholder="Optional prompt — extra instructions for this reviewer"
                  rows={2}
                  className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:bg-muted/40"
                />
              </div>
            </div>
          </div>
        ))}
        {/* Add one to the end — opens the picker. */}
        <ReviewerPicker
          variant="icon"
          workspaceId={workspaceId}
          conn={conn}
          value={undefined}
          onChange={(ref) => onPatch({ reviewers: addReviewerToGroup(allSteps(group), 0, ref)[0]?.reviewers })}
          title="Add a reviewer to the end"
        />
        <ConcurrencyField
          value={group.concurrency}
          onChange={(concurrency) => onPatch(setStepConcurrency(allSteps(group), 0, concurrency)[0] as Partial<PresetWorkflowStep>)}
          hint="How many group reviewers run in parallel (fan-out). Omitted = sequential."
        />
      </div>
    </SectionCard>
  )
}

/** The fixer wave: one model + concurrency. */
function FixersCard({
  fixers,
  onAdd,
  onPatch,
  conn,
}: {
  fixers: PresetWorkflowStep | undefined
  onAdd: () => void
  onPatch: (patch: Partial<PresetWorkflowStep>) => void
  conn: 'connecting' | 'open' | 'closed'
}) {
  if (fixers === undefined) {
    return (
      <SectionCard
        icon={<Wrench className="size-3.5" />}
        title="Fixers"
        description="Apply fixes for findings — fan-out waves"
        missing
        onAdd={onAdd}
        addLabel="Add the fixers step"
      />
    )
  }
  return (
    <SectionCard
      icon={<Wrench className="size-3.5" />}
      title="Fixers"
      description="Apply fixes for findings — fan-out waves"
    >
      <div className="flex flex-col gap-2">
        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Model <span className="text-rose-400">(required)</span>
            </label>
            <InfoTip text="Model that runs the fixer agents — required." />
          </div>
          <ModelSelect
            conn={conn}
            value={fixers.model ?? null}
            onChange={(model) => onPatch({ model: model === null ? undefined : model, fallbackModel: model === null || fixers.fallbackModel === model ? undefined : fixers.fallbackModel })}
            hideDefault
          />
          <FallbackModelsPicker
            conn={conn}
            value={fixers.fallbackModel}
            onChange={(fallbackModel) => onPatch({ fallbackModel })}
            primary={fixers.model}
            label="Fallback fixer models"
          />
        </div>
        <ConcurrencyField
          value={fixers.concurrency}
          onChange={(concurrency) => onPatch({ concurrency })}
          hint="How many fixers run in parallel (fan-out). Omitted = sequential."
        />
      </div>
    </SectionCard>
  )
}

/** The aggregation turn — merges the group's scratch into the canonical review.
 * Stored on the reviewer-group step (`model`/`fallbackModel`) but rendered as
 * its own top-level card so all orchestration-role models sit together. */
function AggregatorCard({
  group,
  onAddGroup,
  onPatchGroup,
  conn,
}: {
  group: PresetWorkflowStep | undefined
  onAddGroup: () => void
  onPatchGroup: (patch: Partial<PresetWorkflowStep>) => void
  conn: 'connecting' | 'open' | 'closed'
}) {
  if (group === undefined) {
    return (
      <SectionCard
        icon={<GitMerge className="size-3.5" />}
        title="Aggregator"
        description="Merges reviewer scratch into one canonical review"
        missing
        onAdd={onAddGroup}
        addLabel="Add the reviewer group (its aggregation lives here)"
      />
    )
  }
  return (
    <SectionCard
      icon={<GitMerge className="size-3.5" />}
      title="Aggregator"
      description="Merges reviewer scratch into one canonical review"
    >
      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Model <span className="text-rose-400">(required)</span>
          </label>
          <InfoTip text="Model that merges this group's reviews into the canonical review — runs after the group. Required." />
        </div>
        <ModelSelect
          conn={conn}
          value={group.model ?? null}
          onChange={(model) =>
            onPatchGroup({
              model: model === null ? undefined : model,
              fallbackModel:
                model === null || group.fallbackModel === model ? undefined : group.fallbackModel,
            })
          }
          hideDefault
        />
        <FallbackModelsPicker
          conn={conn}
          value={group.fallbackModel}
          onChange={(fallbackModel) => onPatchGroup({ fallbackModel })}
          primary={group.model}
          label="Fallback aggregation models"
        />
      </div>
    </SectionCard>
  )
}

/** The bookkeeper agent — creates loop scaffolding/artifacts from templates. */
function BookkeeperCard({
  bookkeeper,
  onChange,
  conn,
}: {
  bookkeeper: { model?: string; fallbackModel?: string }
  onChange: (bookkeeper: { model?: string; fallbackModel?: string }) => void
  conn: 'connecting' | 'open' | 'closed'
}) {
  return (
    <SectionCard
      icon={<NotebookPen className="size-3.5" />}
      title="Bookkeeper"
      description="Creates loop files + artifacts from templates"
    >
      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Model <span className="text-rose-400">(required)</span>
          </label>
          <InfoTip text="Model for the bookkeeper agent that scaffolds loop files and artifacts from templates — required." />
        </div>
        <ModelSelect
          conn={conn}
          value={bookkeeper.model ?? null}
          onChange={(model) =>
            onChange({
              ...bookkeeper,
              model: model === null ? undefined : model,
              fallbackModel:
                model === null || bookkeeper.fallbackModel === model ? undefined : bookkeeper.fallbackModel,
            })
          }
          hideDefault
        />
        <FallbackModelsPicker
          conn={conn}
          value={bookkeeper.fallbackModel}
          onChange={(fallbackModel) => onChange({ ...bookkeeper, fallbackModel })}
          primary={bookkeeper.model}
          label="Fallback bookkeeper models"
        />
      </div>
    </SectionCard>
  )
}

/** The supervisor verdict turn at the end of each cycle (loop-level, not a step). */
function SupervisorCard({
  supervisor,
  onChange,
  conn,
}: {
  supervisor: { model?: string; fallbackModel?: string }
  onChange: (supervisor: { model?: string; fallbackModel?: string }) => void
  conn: 'connecting' | 'open' | 'closed'
}) {
  return (
    <SectionCard
      icon={<Gavel className="size-3.5" />}
      title="Supervisor"
      description="End-of-cycle verdict — do open issues remain?"
    >
      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Model <span className="text-rose-400">(required)</span>
          </label>
          <InfoTip text="Model for the supervisor's verdict turn after every cycle — required." />
        </div>
        <ModelSelect
          conn={conn}
          value={supervisor.model ?? null}
          onChange={(model) =>
            onChange({
              ...supervisor,
              model: model === null ? undefined : model,
              fallbackModel:
                model === null || supervisor.fallbackModel === model ? undefined : supervisor.fallbackModel,
            })
          }
          hideDefault
        />
        <FallbackModelsPicker
          conn={conn}
          value={supervisor.fallbackModel}
          onChange={(fallbackModel) => onChange({ ...supervisor, fallbackModel })}
          primary={supervisor.model}
          label="Fallback supervisor models"
        />
      </div>
    </SectionCard>
  )
}

// --- small helpers over the single-step arrays used above ---

/** Wraps one step in a 1-element array so workflow.ts's index-based helpers work. */
const allSteps = (step: PresetWorkflowStep): PresetWorkflowStep[] => [step]

/** Removes one entry from a roster array (immutably). */
const removeEntry = <T,>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index)

/** Loop-level execution controls: loops × cycles, deadlock handling. */
function ExecutionBar({
  value,
  onChange,
}: {
  value: PresetLoopConfig
  onChange: (config: PresetLoopConfig) => void
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Repeat className="size-3.5" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Execution
        </span>
        <span className="hidden truncate text-[10px] text-muted-foreground/60 sm:block">
          How many times the pipeline runs and how deadlock is handled
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField
          label="Loops"
          hint="Independent reviewer loops — how many times the whole pipeline runs"
          value={value.maxLoops}
          onChange={(maxLoops) => onChange({ ...value, maxLoops })}
        />
        <NumberField
          label="Cycles / loop"
          hint="Re-review passes per loop (defaults to Loops for legacy presets)"
          value={value.maxCycles ?? value.maxLoops}
          onChange={(maxCycles) => onChange({ ...value, maxCycles })}
        />
        <NumberField
          label="Deadlock flip"
          hint="Reviews flip sides after this many unresolved passes"
          value={value.deadlock.flipThreshold}
          onChange={(flipThreshold) =>
            onChange({ ...value, deadlock: { ...value.deadlock, flipThreshold } })
          }
        />
        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <InfoTip text="What happens when the loop deadlocks — escalate to a human." />
          </div>
          <div className="rounded-md border border-input px-2 py-1.5 text-xs text-muted-foreground">
            escalate
          </div>
        </div>
      </div>
    </div>
  )
}

/** A small numeric field for the execution bar. */
function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: number
  onChange: (value: number) => void
}) {
  // Local draft so the field can be emptied/edited freely while typing; the
  // ≥1 clamp only applies on blur. Without this, a controlled value that is
  // clamped immediately snaps back and you can never delete the last digit.
  const [draft, setDraft] = useState<string>(String(Number.isFinite(value) ? value : 1))
  useEffect(() => {
    setDraft(String(Number.isFinite(value) ? value : 1))
  }, [value])

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <InfoTip text={hint} />
      </div>
      <input
        type="number"
        min={1}
        autoComplete="off"
        value={draft}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          const n = Math.trunc(Number(raw))
          if (raw !== '' && Number.isFinite(n) && n >= 1) onChange(n)
        }}
        onBlur={() => {
          const next = Math.max(1, Math.trunc(Number(draft) || 1))
          setDraft(String(next))
          onChange(next)
        }}
        className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>
  )
}
