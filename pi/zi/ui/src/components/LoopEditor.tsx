import { useEffect, useState } from 'react'
import { Repeat } from 'lucide-react'
import type { PresetLoopConfig } from '@/protocol'
import { WorkflowEditor } from '@/components/WorkflowEditor'
import { InfoTip } from '@/components/ui/tooltip'
import { LOOP_NODE_KINDS } from '@/lib/workflow'

interface LoopEditorProps {
  value: PresetLoopConfig
  onChange: (config: PresetLoopConfig) => void
  /** For the reviewer picklist (workspace profiles). */
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
}

/**
 * Visual canvas editor for LOOP presets — the same drag-and-drop interface
 * as the pipeline editor, but with the loop vocabulary (reviewer group,
 * reviewer, aggregation, fixers, human interruptor) and the loop-level
 * execution controls (loops × cycles, deadlock) beneath the canvas.
 */
export function LoopEditor({ value, onChange, workspaceId, conn }: LoopEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      <ExecutionBar value={value} onChange={onChange} />
      <WorkflowEditor
        value={value}
        onChange={(next) => onChange({ ...value, steps: next.steps })}
        kinds={LOOP_NODE_KINDS}
        showHeader={false}
        workspaceId={workspaceId}
        conn={conn}
      />
    </div>
  )
}

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
