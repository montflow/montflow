import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreatePreset } from '@/lib/usePresets'
import type { PresetConfig } from '@/protocol'
import { ArrowUpRight, Loader2, Workflow } from 'lucide-react'

interface NewPresetDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after creation — carries the created preset name for navigation. */
  onCreated: (name: string) => void
}

/**
 * Starter LOOP config — the loop vocabulary as steps, with the execution
 * controls. The reviewer-group starts with a default aggregation model (the
 * same one the fixer step ships with) but an EMPTY roster — so the preset
 * opens in the `invalid` state ("Add at least one reviewer") and flips to
 * `valid` as reviewers are picked. The aggregation model is required and
 * concrete ("Default (header picker)" is never stored — the validity check
 * only sees the file), so the starter sets one explicitly.
 */
const DEFAULT_LOOP_CONFIG: PresetConfig = {
  steps: [
    { id: 's1', kind: 'reviewer-group', label: 'Reviewers', model: 'deepseek-v4-flash-free' },
    { id: 's2', kind: 'fixers', label: 'Fix', model: 'deepseek-v4-flash-free' },
  ],
  maxLoops: 3,
  maxCycles: 5,
  deadlock: { flipThreshold: 2, action: 'escalate' },
}

/**
 * Minimal preset creation: name + kind + "Create". Pipelines are under
 * construction — only loops are creatable right now. The created preset opens
 * on its detail page, where the drag-and-drop canvas is the editing surface.
 */
export function NewPresetDialog({ workspaceId, open, onOpenChange, onCreated }: NewPresetDialogProps) {
  const createPreset = useCreatePreset(workspaceId)

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setName('')
    setError(null)
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const create = (): void => {
    if (name.trim() === '') return
    createPreset.mutate(
      { name: name.trim(), type: 'loop', config: DEFAULT_LOOP_CONFIG },
      {
        onSuccess: ({ name: createdName }) => {
          onCreated(createdName)
          onOpenChange(false)
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create preset'),
      },
    )
  }

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New preset</DialogTitle>
          <DialogDescription>
            Create the preset, then edit it on its page. It saves in any state — a partially
            configured preset shows as invalid until its required fields are set.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="preset-name" className="text-xs font-medium text-muted-foreground">
              Name (kebab-case)
            </label>
            <Input
              id="preset-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
              placeholder="my-loop"
              className="font-mono"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="flex gap-1 rounded-md border border-input p-1">
              <button
                type="button"
                disabled
                title="Pipelines are under construction — only loops are available right now."
                className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted-foreground/50"
              >
                <Workflow className="size-3.5" />
                Pipeline
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  soon
                </span>
              </button>
              <span className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                Loop
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Review loop — reviewer groups, aggregation, fixers, human interruptor. Edited on the
              drag-and-drop canvas.
            </p>
          </div>
          {error !== null && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="flex-col items-start gap-2">
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={create} disabled={createPreset.isPending || name.trim() === ''}>
              {createPreset.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create
                  <ArrowUpRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
