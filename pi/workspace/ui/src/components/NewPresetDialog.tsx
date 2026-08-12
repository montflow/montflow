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
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { ModelSelect } from '@/components/ModelSelect'
import { runUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { PresetConfig, PresetWorkflowConfig } from '@/protocol'
import { ArrowLeft, ArrowUpRight, Loader2, Sparkles, Workflow } from 'lucide-react'

interface NewPresetDialogProps {
  workspaceId: string
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after creation — carries the created preset name for navigation. */
  onCreated: (name: string) => void
  /** Preselect the preset kind. Defaults to workflow (the visual editor). */
  initialKind?: 'loop' | 'workflow'
}

/** Starter LOOP config — mirrors defaultLoopConfig() on the backend. */
const DEFAULT_LOOP_CONFIG: PresetConfig = {
  reviewers: [{ type: 'builtin', id: 'generic' }],
  supervisor: { model: 'deepseek-v4-pro' },
  fixerModel: 'deepseek-v4-flash-free',
  maxLoops: 3,
  maxCycles: 5,
  deadlock: { flipThreshold: 2, action: 'escalate' },
}

/** Starter WORKFLOW config — three real steps so the canvas is alive immediately. */
const DEFAULT_WORKFLOW_CONFIG: PresetWorkflowConfig = {
  description: 'Review, ask the user, fix',
  steps: [
    // Empty reviewer-group — shows the invalid (red) state until reviewers are added.
    { id: 's1', kind: 'reviewer-group', label: 'Reviewers' },
    { id: 's2', kind: 'human', label: 'Ask the user for input' },
    { id: 's3', kind: 'fixer', label: 'Apply fixes' },
  ],
}

/**
 * Minimal preset creation: name + type (workflow by default → the visual
 * drag-and-drop editor) + "Create & edit". The created preset opens on its
 * detail page, where the editor is the editing surface. Agentic creation is
 * still available through the small "ask an agent" link.
 */
export function NewPresetDialog({
  workspaceId,
  folder,
  open,
  onOpenChange,
  onCreated,
  initialKind,
}: NewPresetDialogProps) {
  const { sendCommand, conn } = useUiSocket()
  const createPreset = useCreatePreset(workspaceId)
  const modelsQuery = useModels(conn)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<'loop' | 'workflow'>(initialKind ?? 'workflow')
  const [agentic, setAgentic] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setName('')
    setKind(initialKind ?? 'workflow')
    setAgentic(false)
    setPrompt('')
    setModel(null)
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
      {
        name: name.trim(),
        type: kind,
        config: kind === 'workflow' ? DEFAULT_WORKFLOW_CONFIG : DEFAULT_LOOP_CONFIG,
      },
      {
        onSuccess: ({ name: createdName }) => {
          onCreated(createdName)
          onOpenChange(false)
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create preset'),
      },
    )
  }

  const startAgentic = (): void => {
    setModel(modelsQuery.data?.selected ?? null)
    setAgentic(true)
  }

  const generate = (): void => {
    if (prompt.trim() === '') return
    if (folder === null) {
      setError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'presetAgentic',
      runId,
      text: prompt.trim(),
      model: model ?? undefined,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{agentic ? 'Ask an agent to write a preset' : 'New preset'}</DialogTitle>
          <DialogDescription>
            {agentic
              ? 'Describe the preset you want — the agent runs in the live session and writes the JSON.'
              : 'Create the preset, then edit it on its page.'}
          </DialogDescription>
        </DialogHeader>

        {agentic ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preset-prompt" className="text-xs font-medium text-muted-foreground">
                Prompt
              </label>
              <textarea
                id="preset-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="e.g. A security-focused pipeline: two reviewers, an aggregate, then a human gate…"
                className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {folder === null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Workspace not connected — agentic creation needs a running /montflow session.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="preset-model" className="text-xs font-medium text-muted-foreground">
                  Model
                </label>
                <ModelSelect conn={conn} value={model} onChange={setModel} />
              </div>
            </div>
            {error !== null && <p className="text-xs text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preset-name" className="text-xs font-medium text-muted-foreground">
                Name (kebab-case)
              </label>
              <Input
                id="preset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') create()
                }}
                placeholder="my-pipeline"
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <div className="flex gap-1 rounded-md border border-input p-1">
                <button
                  type="button"
                  onClick={() => setKind('workflow')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    kind === 'workflow'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Workflow className="size-3.5" />
                  Workflow
                </button>
                <button
                  type="button"
                  onClick={() => setKind('loop')}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    kind === 'loop'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Loop
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {kind === 'workflow'
                  ? 'Open-ended step pipeline — edit it on the drag-and-drop canvas.'
                  : 'Classic review loop — supervisor, reviewers, fixers. Edited as JSON / by an agent.'}
              </p>
            </div>
            {error !== null && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        <DialogFooter className="flex-col items-start gap-2">
          {agentic ? (
            <div className="flex w-full justify-end gap-2">
              <Button variant="ghost" onClick={() => setAgentic(false)}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
              <Button onClick={generate} disabled={prompt.trim() === ''}>
                <Sparkles className="size-3.5" />
                Generate
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={startAgentic}
                className="self-start text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Prefer an agent? Ask it to write the preset.
              </button>
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
                      {kind === 'workflow' ? 'Create & edit' : 'Create'}
                      <ArrowUpRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
