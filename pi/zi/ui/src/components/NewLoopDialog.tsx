import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AiInput } from '@/components/AiInput'
import { useCreateLoop, type KickoffOptions } from '@/lib/useLoops'
import { usePresets } from '@/lib/usePresets'
import { presetStatus } from '@/lib/presetStatus'
import { loopUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { PresetSummary } from '@/protocol'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  CircleX,
  GitBranch,
  Loader2,
  Rocket,
  Sparkles,
} from 'lucide-react'

interface NewLoopDialogProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands; null when the workspace is offline. */
  folder: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Kickoff wizard step — pick the preset first, then the scope mode. */
type Step = 'preset' | 'scope'
/** The chosen scope — git-unstaged or agentic (null = none chosen yet). */
type ScopeMode = 'git' | 'agentic' | null

/**
 * Kickoff wizard, staged like the other create modals: FIRST pick a loop
 * preset, THEN choose git-unstaged or agentic scope (with a back step to
 * change the preset). The preset must be a VALID loop preset. In agentic
 * mode the goal is an AiInput — an AI can draft the review goal for you.
 * On kickoff a loop row is created (placeholder until the backend lands) and
 * the browser routes to its detail page.
 */
export function NewLoopDialog({
  workspaceId,
  conn,
  folder,
  open,
  onOpenChange,
}: NewLoopDialogProps) {
  const { data: presets } = usePresets(workspaceId, conn)
  const createLoop = useCreateLoop(workspaceId)

  const [step, setStep] = useState<Step>('preset')
  const [presetName, setPresetName] = useState<string | null>(null)
  const [mode, setMode] = useState<ScopeMode>(null)
  const [goal, setGoal] = useState('')

  // Only LOOP presets are kickoff-able (pipelines aren't executable).
  const loopPresets = useMemo(
    () => (presets ?? []).filter((p) => (p.type ?? 'loop') === 'loop'),
    [presets],
  )
  const selected: PresetSummary | null =
    loopPresets.find((p) => p.name === presetName) ?? null
  const selectedValid = selected !== null && presetStatus(selected.config).status === 'valid'

  const reset = (): void => {
    setStep('preset')
    setPresetName(null)
    setMode(null)
    setGoal('')
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const kickoff = (): void => {
    if (selected === null || !selectedValid || mode === null) return
    const options: KickoffOptions =
      mode === 'agentic'
        ? { preset: selected.name, scope: { type: 'agentic', goal: goal.trim() } }
        : { preset: selected.name, scope: { type: 'git-unstaged' } }
    createLoop.mutate(options, {
      onSuccess: (loop) => {
        onOpenChange(false)
        navigate(loopUrl(workspaceId, loop.id))
      },
    })
  }

  const canContinue = selectedValid
  const canKick =
    selectedValid && mode !== null && (mode === 'git' || (mode === 'agentic' && goal.trim() !== ''))

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'preset' ? 'Kick off a review loop' : 'Choose the scope'}
          </DialogTitle>
          <DialogDescription>
            {step === 'preset'
              ? 'Pick a loop preset — its reviewers, aggregation, and fixer structure drive the review.'
              : 'How should this loop get what it reviews?'}
          </DialogDescription>
        </DialogHeader>

        {step === 'preset' ? (
          <PresetField presets={loopPresets} value={presetName} onChange={setPresetName} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <Button
                variant={mode === 'git' ? 'default' : 'outline'}
                className="justify-start py-6"
                onClick={() => setMode(mode === 'git' ? null : 'git')}
              >
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Git unstaged</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Review the current uncommitted changes.
                  </span>
                </span>
              </Button>
              <Button
                variant={mode === 'agentic' ? 'default' : 'outline'}
                className="justify-start py-6"
                onClick={() => setMode(mode === 'agentic' ? null : 'agentic')}
              >
                <Sparkles className="size-4 text-muted-foreground" />
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">Agentic</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Resolve a feature brief from a goal.
                  </span>
                </span>
              </Button>
            </div>

            {mode === 'agentic' && (
              <>
                <AiInput
                  value={goal}
                  onChange={setGoal}
                  folder={folder}
                  label="Goal"
                  prompt={
                    "Draft a concrete goal for an agentic review loop.\nIt drives the supervisor's brief, so it must state the feature or change to scope and review."
                  }
                  placeholder="e.g. Add a resumable kickoff that resolves scope into a supervisor brief…"
                  className="min-h-28"
                />
                {folder === null && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Workspace not connected — AI drafting of the goal needs a running /montflow session.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'scope' && (
            <Button variant="ghost" onClick={() => setStep('preset')}>
              <ArrowLeft className="size-3.5" />
              Preset
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {step === 'preset' ? (
            <Button onClick={() => setStep('scope')} disabled={!canContinue}>
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button onClick={kickoff} disabled={createLoop.isPending || !canKick}>
              {createLoop.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Kicking off…
                </>
              ) : (
                <>
                  Kick off
                  <Rocket className="size-3.5" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shared required preset picker — only valid LOOP presets are selectable. */
function PresetField({
  presets,
  value,
  onChange,
}: {
  presets: PresetSummary[]
  value: string | null
  onChange: (name: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Preset <span className="text-rose-400">(required)</span>
      </label>
      <div className="max-h-48 overflow-y-auto rounded-md border">
        {presets.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No loop presets yet — create one in the Presets section first.
          </p>
        ) : (
          presets.map((preset) => {
            const { status, issues } = presetStatus(preset.config)
            const invalid = status !== 'valid'
            const active = value === preset.name
            return (
              <button
                key={preset.name}
                type="button"
                disabled={invalid}
                onClick={() => onChange(preset.name)}
                title={invalid ? issues.join('\n') : undefined}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed ${
                  active ? 'bg-primary/10' : invalid ? 'opacity-50' : 'hover:bg-muted/40'
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    active ? 'bg-primary' : invalid ? 'bg-muted' : 'bg-transparent ring-1 ring-border'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {titleFromSlug(preset.name)}
                </span>
                {invalid ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                    <CircleX className="size-3" />
                    invalid
                  </span>
                ) : (
                  active && <CircleCheck className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
