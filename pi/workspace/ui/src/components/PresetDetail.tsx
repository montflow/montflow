import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
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
import { WorkflowEditor } from '@/components/WorkflowEditor'
import { LoopEditor } from '@/components/LoopEditor'
import { useCreatePreset, useDeletePreset, usePresetDetail } from '@/lib/usePresets'
import { isLoopConfigShape, isPipelineConfigShape, presetStatus } from '@/lib/presetStatus'
import { workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { PresetConfig, PresetLoopConfig, PresetSummary, PresetWorkflowConfig } from '@/protocol'
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader2,
  Repeat,
  Trash2,
  Workflow,
} from 'lucide-react'

interface PresetDetailProps {
  workspaceId: string
  presetName: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

export function PresetDetail({ workspaceId, presetName, conn, folder }: PresetDetailProps) {
  const queryClient = useQueryClient()
  const { data: preset, isPending, isError, error, refetch } = usePresetDetail(
    workspaceId,
    presetName,
    conn,
  )

  const [deleteOpen, setDeleteOpen] = useState(false)

  // Filters are in the query string (see PresetsSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      {isError && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
          <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isPending ? (
        <div className="mt-6 animate-pulse space-y-3">
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
          <div className="h-40 w-full rounded bg-muted" />
        </div>
      ) : preset !== null ? (
        <>
          <PresetHeader preset={preset} onDelete={() => setDeleteOpen(true)} />
          <PresetConfigView
            preset={preset}
            workspaceId={workspaceId}
            conn={conn}
            folder={folder}
            onSaved={() =>
              void queryClient.invalidateQueries({ queryKey: ['presets', workspaceId] })
            }
          />
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Preset not found.</p>
      )}

      <DeletePresetDialog
        workspaceId={workspaceId}
        presetName={presetName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={back}
      />
    </main>
  )
}

function PresetHeader({
  preset,
  onDelete,
}: {
  preset: PresetSummary
  onDelete: () => void
}) {
  const config = preset.config
  const isPipeline = preset.type === 'pipeline'
  const { status, issues } = presetStatus(config)
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <span className="truncate">{titleFromSlug(preset.name)}</span>
            {preset.error !== undefined && (
              <span
                title={preset.error}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-500"
              >
                <CircleAlert className="size-3" />
                invalid file
              </span>
            )}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            .agents/@montflow/review-presets/{preset.name}.json
          </p>
          {config !== undefined && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={isPipeline ? 'outline' : 'secondary'}
                title={
                  isPipeline
                    ? 'Pipeline preset — open-ended step pipeline (not yet executable)'
                    : 'Review loop preset — reviewer groups, aggregation, fixers, human interruptor'
                }
                className={isPipeline ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300' : undefined}
              >
                {isPipeline ? 'pipeline' : 'loop'}
              </Badge>
              <Badge
                variant={status === 'valid' ? 'secondary' : 'outline'}
                title={
                  status === 'valid'
                    ? 'All required fields are set — this preset is ready to run.'
                    : `Missing:\n- ${issues.join('\n- ')}`
                }
                className={
                  status === 'valid'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }
              >
                {status === 'valid' ? (
                  <CircleCheck className="size-3" />
                ) : (
                  <CircleX className="size-3" />
                )}
                {status}
              </Badge>
              <Badge variant="secondary" title="Number of steps in this preset">
                {config.steps.length} step{config.steps.length === 1 ? '' : 's'}
              </Badge>
              {isLoopConfigShape(config) && (
                <>
                  <Badge variant="secondary" title="Review loops × cycles per loop">
                    {config.maxLoops}
                    <span className="text-muted-foreground">×</span>
                    {config.maxCycles ?? config.maxLoops}
                  </Badge>
                  <Badge variant="outline" title="Deadlock handling">
                    flip after {config.deadlock.flipThreshold} · {config.deadlock.action}
                  </Badge>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>
      {preset.error !== undefined && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-500">
          This preset file could not be parsed: {preset.error}
        </p>
      )}
      {status === 'invalid' && issues.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
          {issues.map((issue, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <CircleX className="mt-0.5 size-3 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Config editor. Both preset kinds default to a visual drag-and-drop canvas
 * (pipeline: free-form stage pipeline; loop: fixed reviewers → supervisor →
 * fixer → execution structure) with a JSON fallback tab. Saving is allowed in
 * any state — an invalid preset saves as invalid and flips to valid live as
 * the required fields are completed.
 */
function PresetConfigView({
  preset,
  workspaceId,
  conn,
  folder,
  onSaved,
}: {
  preset: PresetSummary
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  folder: string | null
  onSaved: () => void
}) {
  const createPreset = useCreatePreset(workspaceId)
  const isPipeline = preset.type === 'pipeline' && isPipelineConfigShape(preset.config)
  const isLoop = preset.type === 'loop' && isLoopConfigShape(preset.config)
  const presetKey = preset.name // re-arm only when navigating between presets

  const [mode, setMode] = useState<'visual' | 'json'>(isPipeline || isLoop ? 'visual' : 'json')
  const [workflowConfig, setWorkflowConfig] = useState<PresetWorkflowConfig | null>(() =>
    isPipeline && isPipelineConfigShape(preset.config)
      ? { description: preset.config.description, steps: preset.config.steps }
      : null,
  )
  const [loopConfig, setLoopConfig] = useState<PresetLoopConfig | null>(() =>
    isLoop && isLoopConfigShape(preset.config) ? preset.config : null,
  )
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMode(isPipeline || isLoop ? 'visual' : 'json')
    setWorkflowConfig(
      isPipeline && isPipelineConfigShape(preset.config)
        ? { description: preset.config.description, steps: preset.config.steps }
        : null,
    )
    setLoopConfig(
      isLoop && isLoopConfigShape(preset.config) ? preset.config : null,
    )
    setEditing(false)
    setDraft('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey])

  // Live status from the in-progress draft (visual mode), falling back to the
  // last saved config — so the badge flips to valid as fields are completed.
  const liveConfig: PresetConfig | undefined =
    (isPipeline ? workflowConfig : isLoop ? loopConfig : null) ?? preset.config
  const { status, issues } = presetStatus(liveConfig)

  const startJson = (): void => {
    setDraft(JSON.stringify(preset.config ?? {}, null, 2))
    setError(null)
    setEditing(true)
  }

  const discard = (): void => {
    setEditing(false)
    setError(null)
  }

  const save = (): void => {
    let config: PresetConfig
    try {
      config = JSON.parse(draft) as PresetConfig
    } catch {
      setError('Invalid JSON — fix the syntax before saving.')
      return
    }
    if (typeof config !== 'object' || config === null) {
      setError('Config must be a JSON object.')
      return
    }
    if (preset.type === 'pipeline') {
      if (!('steps' in config) || !Array.isArray(config.steps)) {
        setError('Pipeline config must be a JSON object with a "steps" array.')
        return
      }
    } else if (!('steps' in config) || !Array.isArray(config.steps)) {
      setError('Loop config must be a JSON object with a "steps" array (plus maxLoops and deadlock).')
      return
    }
    createPreset.mutate(
      { name: preset.name, type: preset.type ?? 'loop', config },
      {
        onSuccess: () => {
          setEditing(false)
          setError(null)
          onSaved()
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to save preset'),
      },
    )
  }

  const saveVisual = (): void => {
    if (isPipeline) {
      if (workflowConfig === null) return
      createPreset.mutate(
        { name: preset.name, type: 'pipeline', config: workflowConfig },
        {
          onSuccess: () => {
            setError(null)
            onSaved()
          },
          onError: (e) => setError(e instanceof Error ? e.message : 'Failed to save preset'),
        },
      )
      return
    }
    if (loopConfig === null) return
    createPreset.mutate(
      { name: preset.name, type: 'loop', config: loopConfig },
      {
        onSuccess: () => {
          setError(null)
          onSaved()
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to save preset'),
      },
    )
  }

  const visualReady = isPipeline ? workflowConfig !== null : isLoop ? loopConfig !== null : false

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          {isPipeline ? <Workflow className="size-4" /> : <Repeat className="size-4" />}
          {isPipeline ? 'Pipeline' : 'Loop'}
          <Badge
            variant={status === 'valid' ? 'secondary' : 'outline'}
            className={
              status === 'valid'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }
            title={status === 'valid' ? 'Ready to run' : issues.join('\n')}
          >
            {status === 'valid' ? (
              <CircleCheck className="size-3" />
            ) : (
              <CircleX className="size-3" />
            )}
            {status}
          </Badge>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md border border-input p-0.5">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                mode === 'visual'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setMode('json')}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                mode === 'json'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              JSON
            </button>
          </div>
          {(mode === 'json' ? editing : true) && (
            <div className="flex gap-2">
              {mode === 'json' && (
                <Button size="xs" variant="outline" onClick={discard} disabled={createPreset.isPending}>
                  Discard
                </Button>
              )}
              <Button
                size="xs"
                onClick={mode === 'visual' ? saveVisual : save}
                disabled={createPreset.isPending || (mode === 'visual' && !visualReady)}
              >
                {createPreset.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {mode === 'visual' && (isPipeline || isLoop) ? (
        <div className="flex flex-col gap-3">
          {isPipeline && workflowConfig !== null ? (
            <WorkflowEditor
              value={workflowConfig}
              onChange={setWorkflowConfig}
              workspaceId={workspaceId}
              conn={conn}
            />
          ) : (
            isLoop &&
            loopConfig !== null && (
              <LoopEditor
                value={loopConfig}
                onChange={setLoopConfig}
                workspaceId={workspaceId}
                conn={conn}
              />
            )
          )}
          {error !== null && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : editing ? (
        <>
          <AiInput
            value={draft}
            onChange={setDraft}
            folder={folder}
            spellCheck={false}
            autoFocus
            autoComplete="off"
            className="min-h-80 font-mono"
          />
          {error !== null && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </>
      ) : (
        <pre
          role="button"
          tabIndex={0}
          onClick={startJson}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              startJson()
            }
          }}
          title="Click to edit"
          className="cursor-text overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {preset.config === undefined ? (
            <span className="text-muted-foreground">
              Preset file is invalid — click to edit the raw JSON.
            </span>
          ) : (
            JSON.stringify(preset.config, null, 2)
          )}
        </pre>
      )}
    </section>
  )
}

function DeletePresetDialog({
  workspaceId,
  presetName,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  presetName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const deletePreset = useDeletePreset(workspaceId)
  const [error, setError] = useState<string | null>(null)

  const remove = (): void => {
    deletePreset.mutate(presetName, {
      onSuccess: onDeleted,
      onError: (e) => setError(e instanceof Error ? e.message : 'Failed to delete preset'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete preset?</DialogTitle>
          <DialogDescription>
            This permanently removes{' '}
            <code className="rounded bg-muted px-1">
              .agents/@montflow/review-presets/{presetName}.json
            </code>{' '}
            from the workspace. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error !== null && <p className="text-xs text-red-500">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deletePreset.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={deletePreset.isPending}>
            {deletePreset.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
