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
import type { PresetConfig } from '@/protocol'
import { ArrowLeft, ArrowUpRight, Braces, Loader2, Sparkles } from 'lucide-react'

interface NewPresetDialogProps {
  workspaceId: string
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a manual create — carries the created preset name for navigation. */
  onCreated: (name: string) => void
}

type Mode = 'choose' | 'manual' | 'agentic'

/** Starting point for manual presets — same shape defaultLoopConfig() uses. */
const DEFAULT_CONFIG_JSON = `{
  "reviewers": [
    { "type": "builtin", "id": "generic" }
  ],
  "supervisor": { "model": "deepseek-v4-pro" },
  "fixerModel": "deepseek-v4-flash-free",
  "maxLoops": 3,
  "maxCycles": 5,
  "deadlock": { "flipThreshold": 2, "action": "escalate" }
}`

export function NewPresetDialog({
  workspaceId,
  folder,
  open,
  onOpenChange,
  onCreated,
}: NewPresetDialogProps) {
  const { sendCommand, conn } = useUiSocket()
  const createPreset = useCreatePreset(workspaceId)
  // Model override for this run: preselect the header picker's current
  // choice so the user can switch to a different model (null = default).
  const modelsQuery = useModels(conn)

  const [mode, setMode] = useState<Mode>('choose')

  // Manual mode
  const [name, setName] = useState('')
  const [configJson, setConfigJson] = useState(DEFAULT_CONFIG_JSON)
  const [manualError, setManualError] = useState<string | null>(null)

  // Agentic mode
  const [prompt, setPrompt] = useState('')
  /** Per-run model override (`provider/model-id`); null = header picker default. */
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  const reset = (): void => {
    setMode('choose')
    setName('')
    setConfigJson(DEFAULT_CONFIG_JSON)
    setPrompt('')
    setModel(null)
    setManualError(null)
    setAgenticError(null)
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Entering agentic mode: preselect the header picker's current choice so
  // the dropdown shows what would run and lets the user pick another model.
  const startAgentic = (): void => {
    setModel(modelsQuery.data?.selected ?? null)
    setMode('agentic')
  }

  const startGeneration = (): void => {
    if (prompt.trim() === '') return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    // The backend runs the preset authoring in its own isolated agent
    // session. We generate the run id so the run page URL is known now.
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

  const submitManual = (): void => {
    if (name.trim() === '') return
    let config: PresetConfig
    try {
      config = JSON.parse(configJson) as PresetConfig
    } catch {
      setManualError('Invalid JSON — fix the syntax before saving.')
      return
    }
    if (typeof config !== 'object' || config === null || !Array.isArray(config.reviewers)) {
      setManualError('Config must be a JSON object with a "reviewers" array.')
      return
    }
    createPreset.mutate(
      { name: name.trim(), config },
      {
        onSuccess: ({ name: createdName }) => {
          onCreated(createdName)
          onOpenChange(false)
        },
        onError: (error) => {
          setManualError(error instanceof Error ? error.message : 'Failed to create preset')
        },
      },
    )
  }

  const modeBack = (): void => setMode('choose')

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'choose' && 'New preset'}
            {mode === 'manual' && 'Write a preset'}
            {mode === 'agentic' && 'Ask an agent to write a preset'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' &&
              'Presets live in .agents/@montflow/review-presets/<name>.json — the reference-based loop config (reviewers, supervisor, fixer, loops, deadlock) used by review runs.'}
            {mode === 'manual' && 'Paste the full config JSON — the server validates it against the preset schema.'}
            {mode === 'agentic' &&
              'Describe the preset you want — the run happens in the live session, streamed to the session page where you can answer back.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start py-6" onClick={() => setMode('manual')}>
              <Braces className="size-4 text-muted-foreground" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Write it manually</span>
                <span className="text-xs font-normal text-muted-foreground">
                  You control the full config JSON — reviewers, models, loops.
                </span>
              </span>
            </Button>
            <Button variant="outline" className="justify-start py-6" onClick={startAgentic}>
              <Sparkles className="size-4 text-muted-foreground" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Ask an agent</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Describe the review setup in plain words; the agent writes the JSON.
                </span>
              </span>
            </Button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preset-name" className="text-xs font-medium text-muted-foreground">
                Name (kebab-case)
              </label>
              <Input
                id="preset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="security-audit"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preset-config" className="text-xs font-medium text-muted-foreground">
                Config JSON
              </label>
              <textarea
                id="preset-config"
                value={configJson}
                onChange={(event) => setConfigJson(event.target.value)}
                spellCheck={false}
                className="min-h-64 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {manualError !== null && <p className="text-xs text-red-500">{manualError}</p>}
          </div>
        )}

        {mode === 'agentic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preset-prompt" className="text-xs font-medium text-muted-foreground">
                Prompt
              </label>
              <textarea
                id="preset-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="e.g. A security-focused review setup: security + quality builtins, supervisor on the strong model, 3 loops…"
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
              {agenticError !== null && <p className="text-xs text-red-500">{agenticError}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {mode !== 'choose' && (
            <Button variant="ghost" onClick={modeBack}>
              <ArrowLeft className="size-3.5" />
              Mode
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {mode === 'manual' && (
            <Button
              onClick={submitManual}
              disabled={createPreset.isPending || name.trim() === '' || configJson.trim() === ''}
            >
              {createPreset.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create preset
                  <ArrowUpRight className="size-3.5" />
                </>
              )}
            </Button>
          )}
          {mode === 'agentic' && (
            <Button onClick={startGeneration} disabled={prompt.trim() === ''}>
              <Sparkles className="size-3.5" />
              Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
