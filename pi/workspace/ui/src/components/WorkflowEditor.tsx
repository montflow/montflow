import { useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Braces,
  ClipboardList,
  GitBranch,
  GitMerge,
  GripVertical,
  MessageCircle,
  Plus,
  Repeat,
  Trash2,
  Users,
  UsersRound,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { PresetReviewerRef, PresetWorkflowConfig, PresetWorkflowStep } from '@/protocol'
import { ReviewerPicker } from '@/components/ReviewerPicker'
import { ModelSelect } from '@/components/ModelSelect'
import { InfoTip } from '@/components/ui/tooltip'
import {
  WORKFLOW_NODE_KINDS,
  addReviewerToGroup,
  appendStep,
  createStep,
  groupReviewerPrompt,
  groupReviewerRef,
  insertStepAt,
  isGroupStep,
  moveStep,
  nodeKindOf,
  removeReviewerFromGroup,
  removeStepAt,
  setGroupReviewer,
  setGroupReviewerModel,
  setGroupReviewerPrompt,
  setStepReviewer,
  setStepReviewerModel,
  stepError,
  updateStep,
} from '@/lib/workflow'

/** Id of the canvas droppable (drop here = append at the end). */
const CANVAS_ID = 'workflow-canvas'
/** Sortable row ids are `row:<stepId>`; palette items are `palette:<kind>`. */
const rowId = (stepId: string): string => `row:${stepId}`
const paletteId = (kind: string): string => `palette:${kind}`

/** Node icon per known kind; unknown kinds render a generic workflow icon. */
const KIND_ICONS: Record<string, LucideIcon> = {
  reviewer: Users,
  'reviewer-group': UsersRound,
  human: MessageCircle,
  fixer: Wrench,
  // Legacy kinds from earlier editors — still rendered for saved steps.
  brief: ClipboardList,
  aggregate: GitMerge,
  gate: MessageCircle,
  loop: Repeat,
  condition: GitBranch,
}
const kindIcon = (kind: string): LucideIcon => KIND_ICONS[kind] ?? Workflow

interface WorkflowEditorProps {
  value: PresetWorkflowConfig
  onChange: (config: PresetWorkflowConfig) => void
  /** For the reviewer picklist (workspace profiles). */
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
}

/**
 * Visual stage-pipeline editor for WORKFLOW presets: a draggable node palette
 * on the right, a vertical stage list on the left. Drag a palette node onto
 * the canvas (append) or onto a row (insert after it); drag rows to reorder;
 * edit each step's label and params JSON inline. Steps are stored as the
 * schema's free-form `steps` array — nothing is lost for hand-written kinds.
 */
export function WorkflowEditor({ value, onChange, workspaceId, conn }: WorkflowEditorProps) {
  const steps = value.steps
  const [overlayKind, setOverlayKind] = useState<string | null>(null)
  // Set while a drag is in flight — the browser still fires a `click` on the
  // palette chip if the pointer is released back on it, which would append a
  // second copy. Cleared just after the click event (setTimeout 0).
  const suppressClickRef = useRef(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const commit = (next: PresetWorkflowStep[]): void =>
    onChange({ ...value, steps: next })

  const handleDragStart = (event: DragStartEvent): void => {
    suppressClickRef.current = true
    const id = String(event.active.id)
    setOverlayKind(id.startsWith('palette:') ? id.slice('palette:'.length) : null)
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    setOverlayKind(null)
    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
    if (over === null) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith('palette:')) {
      const kind = activeId.slice('palette:'.length)
      const overIndex = steps.findIndex((s) => rowId(s.id) === overId)
      // Dropping a REVIEWER chip onto a reviewer-group row adds it to the END
      // of the group's roster instead of creating a new top-level step.
      if (kind === 'reviewer' && overIndex >= 0 && isGroupStep(steps[overIndex]!)) {
        // A dropped reviewer is EMPTY (unconfigured) — the group entry needs
        // a pick too, so add an empty ref the user must configure.
        commit(addReviewerToGroup(steps, overIndex, { type: 'builtin', id: 'generic' }))
        return
      }
      // Palette → canvas: append (dropped on the canvas) or insert after the
      // hovered row.
      const step = createStep(steps, kind)
      if (overId === CANVAS_ID) {
        commit(appendStep(steps, step))
        return
      }
      if (overIndex >= 0) {
        commit(insertStepAt(steps, overIndex + 1, step))
      } else {
        commit(appendStep(steps, step))
      }
      return
    }

    // Row → row: reorder.
    const fromIndex = steps.findIndex((s) => rowId(s.id) === activeId)
    const toIndex = steps.findIndex((s) => rowId(s.id) === overId)
    if (fromIndex >= 0 && toIndex >= 0) commit(moveStep(steps, fromIndex, toIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setOverlayKind(null)
        setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }}
    >
      <div className="flex gap-4">
        {/* Canvas — vertical stage list */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-col gap-2">
            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <InfoTip text="Short name for this workflow — shown in list and detail views." />
              </div>
              <input
                value={value.description ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    description: event.target.value === '' ? undefined : event.target.value,
                  })
                }
                placeholder="e.g. Security review"
                className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                <InfoTip text="Global prompt — injected into every agent run in this workflow. Put repo-wide rules or constraints that every agent must follow here." />
              </div>
              <textarea
                value={value.prompt ?? ''}
                onChange={(event) =>
                  onChange({
                    ...value,
                    prompt: event.target.value === '' ? undefined : event.target.value,
                  })
                }
                placeholder="Global prompt — given to every agent in this workflow"
                rows={2}
                className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <CanvasDropZone isEmpty={steps.length === 0}>
            <SortableContext items={steps.map((s) => rowId(s.id))} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-2">
                {steps.map((step, index) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={index}
                    workspaceId={workspaceId}
                    conn={conn}
                    onUpdate={(patch) => commit(updateStep(steps, index, patch))}
                    onRemove={() => commit(removeStepAt(steps, index))}
                    onChangeReviewer={(ref) => commit(setStepReviewer(steps, index, ref))}
                    onChangeReviewerModel={(model) =>
                      commit(setStepReviewerModel(steps, index, model))
                    }
                    onChangeReviewerAt={(reviewerIndex, ref) =>
                      commit(setGroupReviewer(steps, index, reviewerIndex, ref))
                    }
                    onChangeReviewerModelAt={(reviewerIndex, model) =>
                      commit(setGroupReviewerModel(steps, index, reviewerIndex, model))
                    }
                    onChangeReviewerPrompt={(reviewerIndex, prompt) =>
                      commit(setGroupReviewerPrompt(steps, index, reviewerIndex, prompt))
                    }
                    onRemoveReviewer={(reviewerIndex) =>
                      commit(removeReviewerFromGroup(steps, index, reviewerIndex))
                    }
                    onAddReviewer={(ref) =>
                      commit(addReviewerToGroup(steps, index, ref))
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </CanvasDropZone>
        </div>

        {/* Palette — draggable node kinds (must live INSIDE the DndContext
            so useDraggable can register the drag). Sticky: stays fixed on the
            right while the pipeline scrolls. */}
        <aside className="sticky top-3 max-h-[calc(100dvh-2.5rem)] w-44 shrink-0 self-start overflow-y-auto">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Nodes
          </h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Drag onto the canvas, or click to append.
          </p>
          <div className="flex flex-col gap-1.5">
            {WORKFLOW_NODE_KINDS.map((node) => (
              <PaletteChip
                key={node.kind}
                kind={node.kind}
                onClick={() => {
                  if (suppressClickRef.current) return
                  commit(appendStep(steps, createStep(steps, node.kind, node.label)))
                }}
              />
            ))}
          </div>
        </aside>

        <DragOverlay dropAnimation={null}>
          {overlayKind !== null && <PalettePreview kind={overlayKind} />}
        </DragOverlay>
      </div>
    </DndContext>
  )
}

/** The list container — also the append target for palette drops. */
function CanvasDropZone({ isEmpty, children }: { isEmpty: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_ID })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border p-2 transition-colors ${
        isOver ? 'border-primary/60 bg-primary/5' : 'border-border bg-muted/20'
      }`}
    >
      {isEmpty ? (
        <p className="px-2 py-8 text-center text-xs text-muted-foreground">
          {isOver ? 'Drop to add the step' : 'Empty pipeline — drag a node here from the palette'}
        </p>
      ) : (
        children
      )}
    </div>
  )
}

/** One sortable stage row: drag handle, icon, kind, label, reviewer picker, params, delete. */
function StepRow({
  step,
  index,
  workspaceId,
  conn,
  onUpdate,
  onRemove,
  onChangeReviewer,
  onChangeReviewerAt,
  onChangeReviewerModel,
  onChangeReviewerModelAt,
  onRemoveReviewer,
  onChangeReviewerPrompt,
  onAddReviewer,
}: {
  step: PresetWorkflowStep
  index: number
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  onUpdate: (patch: { label?: string; params?: Record<string, unknown>; prompt?: string }) => void
  onRemove: () => void
  onChangeReviewer?: (ref: PresetReviewerRef) => void
  onChangeReviewerAt?: (reviewerIndex: number, ref: PresetReviewerRef) => void
  onChangeReviewerModel?: (model: string | undefined) => void
  onChangeReviewerModelAt?: (reviewerIndex: number, model: string | undefined) => void
  onRemoveReviewer?: (reviewerIndex: number) => void
  onChangeReviewerPrompt?: (reviewerIndex: number, prompt: string | undefined) => void
  onAddReviewer: (ref: PresetReviewerRef) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: rowId(step.id),
    })
  const [paramsOpen, setParamsOpen] = useState(false)
  const [paramsDraft, setParamsDraft] = useState(
    step.params === undefined ? '' : JSON.stringify(step.params, null, 2),
  )
  const [paramsError, setParamsError] = useState<string | null>(null)
  const node = nodeKindOf(step.kind)
  const Icon = kindIcon(step.kind)
  const groupReviewers = step.reviewers ?? []
  const error = stepError(step)

  const commitParams = (): void => {
    const trimmed = paramsDraft.trim()
    if (trimmed === '') {
      onUpdate({ params: undefined })
      setParamsError(null)
      return
    }
    try {
      onUpdate({ params: JSON.parse(trimmed) as Record<string, unknown> })
      setParamsError(null)
    } catch {
      setParamsError('Invalid JSON')
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex flex-col gap-1.5 rounded-md border bg-card p-2 ${
        isDragging ? 'opacity-50' : ''
      } ${
        error !== null
          ? 'border-rose-300/60 bg-rose-50/60 dark:border-rose-400/30 dark:bg-rose-400/5'
          : isGroupStep(step) && isOver
            ? 'border-primary/60 bg-primary/5'
            : ''
      }`}
    >
      {/* Header row: drag handle, icon, kind, error, actions. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
          title="Drag to reorder"
          aria-label={`Reorder step ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>

        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-md ${node?.accent ?? 'bg-muted text-muted-foreground'}`}
          title={step.kind}
        >
          <Icon className="size-3.5" />
        </span>

        <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {node?.label ?? step.kind}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">#{index + 1}</span>

        {error !== null && (
          <span className="truncate text-[10px] font-medium text-rose-400 dark:text-rose-300">
            {error}
          </span>
        )}

        <div className="ml-auto flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => setParamsOpen((prev) => !prev)}
            title={paramsOpen ? 'Hide params' : 'Edit params JSON'}
            className="rounded p-1 text-muted-foreground/50 hover:text-foreground"
          >
            <Braces className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove step"
            className="rounded p-1 text-muted-foreground/50 hover:text-red-500"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Full-width body row — content spans the whole card. */}
      <div className="flex w-full flex-col gap-1.5">
        {step.kind === 'reviewer' && (
          <div className="flex w-full flex-col gap-2">
            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Reviewer</label>
                <InfoTip text="The agent that performs this review — a builtin reviewer or a workspace profile." />
              </div>
              <ReviewerPicker
                workspaceId={workspaceId}
                conn={conn}
                value={step.reviewer}
                onChange={(ref) => onChangeReviewer?.({ ...ref, model: step.reviewer?.model })}
              />
            </div>
            {step.reviewer !== undefined && (
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Model</label>
                  <InfoTip text="Model override for this reviewer. Defaults to the model selected in the header." />
                </div>
                <ModelSelect
                  conn={conn}
                  value={step.reviewer.model ?? null}
                  onChange={(model) => onChangeReviewerModel?.(model === null ? undefined : model)}
                />
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                <InfoTip text="Optional extra instructions for this reviewer — appended to its task." />
              </div>
              <textarea
                value={step.prompt ?? ''}
                onChange={(event) =>
                  onUpdate({ prompt: event.target.value === '' ? undefined : event.target.value })
                }
                placeholder="Optional prompt — extra instructions for this reviewer"
                rows={2}
                className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:bg-muted/40"
              />
            </div>
          </div>
        )}

        {step.kind !== 'reviewer' && (
          <input
            value={step.label ?? ''}
            onChange={(event) =>
              onUpdate({ label: event.target.value === '' ? undefined : event.target.value })
            }
            placeholder={`${node?.label ?? step.kind} label`}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:bg-muted/40"
          />
        )}

        {isGroupStep(step) && (
          <div className="flex flex-col gap-1.5">
            {groupReviewers.length > 0 && (
              <ol className="flex w-full flex-col gap-1.5 rounded-md border border-dashed bg-muted/20 p-1.5">
                {groupReviewers.map((entry, reviewerIndex) => (
                  <li key={reviewerIndex} className="w-full rounded-md border bg-card p-1.5">
                    <div className="flex flex-col gap-2">
                      {/* Header row: reviewer label + trash (no floating column). */}
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Reviewer</label>
                        <InfoTip text="The agent that performs this review — a builtin reviewer or a workspace profile." />
                        <button
                          type="button"
                          onClick={() => onRemoveReviewer?.(reviewerIndex)}
                          title="Remove reviewer"
                          aria-label="Remove reviewer"
                          className="ml-auto rounded p-1 text-muted-foreground/50 transition-colors hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <ReviewerPicker
                        workspaceId={workspaceId}
                        conn={conn}
                        value={groupReviewerRef(entry)}
                        onChange={(next) =>
                          onChangeReviewerAt?.(reviewerIndex, {
                            ...next,
                            model: groupReviewerRef(entry).model,
                          })
                        }
                      />
                      <div>
                        <div className="mb-1 flex items-center gap-1">
                          <label className="text-xs font-medium text-muted-foreground">Model</label>
                          <InfoTip text="Model override for this reviewer. Defaults to the model selected in the header." />
                        </div>
                        <ModelSelect
                          conn={conn}
                          value={groupReviewerRef(entry).model ?? null}
                          onChange={(model) =>
                            onChangeReviewerModelAt?.(reviewerIndex, model === null ? undefined : model)
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-1">
                          <label className="text-xs font-medium text-muted-foreground">Prompt</label>
                          <InfoTip text="Optional extra instructions for this reviewer — appended to its task." />
                        </div>
                        <textarea
                          value={groupReviewerPrompt(entry) ?? ''}
                          onChange={(event) =>
                            onChangeReviewerPrompt?.(
                              reviewerIndex,
                              event.target.value === '' ? undefined : event.target.value,
                            )
                          }
                          placeholder="Optional prompt — extra instructions for this reviewer"
                          rows={2}
                          className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-xs leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:bg-muted/40"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {/* Add one to the end — opens the picker. */}
            <div>
              <ReviewerPicker
                variant="icon"
                workspaceId={workspaceId}
                conn={conn}
                value={undefined}
                onChange={(ref) => onAddReviewer(ref)}
                title="Add a reviewer to the end"
              />
            </div>
          </div>
        )}
        {isGroupStep(step) && isOver && (
          <p className="text-[10px] font-medium text-primary">
            {groupReviewers.length === 0 ? 'Drop reviewers here' : 'Drop to add another reviewer'}
          </p>
        )}
        {paramsOpen && (
          <div>
            <textarea
              value={paramsDraft}
              onChange={(event) => setParamsDraft(event.target.value)}
              onBlur={commitParams}
              spellCheck={false}
              rows={3}
              placeholder={`{ "count": 2, "model": "…" }`}
              className="w-full resize-y rounded border border-input bg-transparent p-2 font-mono text-[11px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {paramsError !== null && (
              <p className="mt-1 text-[10px] text-rose-400 dark:text-rose-300">{paramsError}</p>
            )}
          </div>
        )}
      </div>
    </li>
  )
}


/** A palette chip — draggable onto the canvas, clickable to append. */
function PaletteChip({ kind, onClick }: { kind: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: paletteId(kind) })
  const node = nodeKindOf(kind)
  const Icon = kindIcon(kind)
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      title={`${node?.description ?? kind} — drag onto the canvas`}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
        isDragging ? 'opacity-40' : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'
      }`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded ${node?.accent ?? 'bg-muted text-muted-foreground'}`}
      >
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{node?.label ?? kind}</span>
      <Plus className="size-3 shrink-0 text-muted-foreground/50" />
    </button>
  )
}

/** Static chip rendered inside the DragOverlay while a palette item is dragged. */
function PalettePreview({ kind }: { kind: string }) {
  const node = nodeKindOf(kind)
  const Icon = kindIcon(kind)
  return (
    <div className="flex items-center gap-2 rounded-md border border-primary bg-card px-2 py-1.5 text-xs shadow-lg">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded ${node?.accent ?? 'bg-muted text-muted-foreground'}`}
      >
        <Icon className="size-3" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{node?.label ?? kind}</span>
    </div>
  )
}
