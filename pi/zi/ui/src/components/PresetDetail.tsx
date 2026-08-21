import { useEffect, useRef, useState } from 'react'
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
import { WorkflowEditor } from '@/components/WorkflowEditor'
import { LoopEditor } from '@/components/LoopEditor'
import { useCreatePreset, useDeletePreset, usePresetDetail } from '@/lib/usePresets'
import { isLoopConfigShape, isPipelineConfigShape, presetStatus, type PresetStatus } from '@/lib/presetStatus'
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
}

export function PresetDetail({ workspaceId, presetName, conn }: PresetDetailProps) {
  const queryClient = useQueryClient()
  const { data: preset, isPending, isError, error, refetch } = usePresetDetail(
    workspaceId,
    presetName,
    conn,
  )

  const [deleteOpen, setDeleteOpen] = useState(false)
  // Live validity of the in-progress draft, reported up from the config
  // editor. The header follows the editor (not the last saved file) so a
  // freshly-picked field clears its "missing" message immediately — showing
  // the stale saved-file status here is what made "aggregation model missing"
  // linger after picking a model.
  const [liveStatus, setLiveStatus] = useState<PresetStatus | null>(null)

  // Navigating between presets reuses this component instance — drop the old
  // preset's live status until the new one's editor reports in.
  useEffect(() => {
    setLiveStatus(null)
  }, [presetName])

  // Filters are in the query string (see PresetsSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl">
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
          <PresetHeader preset={preset} liveStatus={liveStatus} onDelete={() => setDeleteOpen(true)} />
          <PresetConfigView
            preset={preset}
            workspaceId={workspaceId}
            conn={conn}
            onLiveStatus={setLiveStatus}
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
      </div>
    </main>
  )
}

function PresetHeader({
  preset,
  liveStatus,
  onDelete,
}: {
  preset: PresetSummary
  /** Live status of the in-progress draft; falls back to the saved config when absent. */
  liveStatus: PresetStatus | null
  onDelete: () => void
}) {
  const config = preset.config
  const isPipeline = preset.type === 'pipeline'
  // Prefer the live editor status — the saved file lags while fields are
  // being filled in, and echoing the stale message ("aggregation model
  // missing") right after the user picked one is exactly the confusion this
  // avoids.
  const { status, issues } = liveStatus ?? presetStatus(config)
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
            <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold">
              v{preset.version ?? 1}
            </span>
          </p>
          {config !== undefined && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={isPipeline ? 'outline' : 'secondary'}
                title={
                  isPipeline
                    ? 'Pipeline preset — open-ended step pipeline (not yet executable)'
                    : 'Review loop preset — reviewer groups, aggregation, fixers'
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
 * Config editor — VISUAL-ONLY. Presets are edited on the drag-and-drop
 * canvas (pipeline: free-form stage pipeline; loop: fixed reviewers →
 * supervisor → fixer → execution structure). The stored JSON file is
 * view-only — it shows the full file (version included) and cannot be
 * hand-edited. Saving is allowed in any state — an invalid preset saves as
 * invalid and flips to valid live as the required fields are completed.
 */
function PresetConfigView({
  preset,
  workspaceId,
  conn,
  onLiveStatus,
  onSaved,
}: {
  preset: PresetSummary
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Reports the live draft's validity upward so the header stays in sync (stable status identity — called only on content change). */
  onLiveStatus?: (status: PresetStatus) => void
  onSaved: () => void
}) {
  const createPreset = useCreatePreset(workspaceId)
  const isPipeline = preset.type === 'pipeline' && isPipelineConfigShape(preset.config)
  const isLoop = preset.type === 'loop' && isLoopConfigShape(preset.config)
  const presetKey = preset.name // re-arm only when navigating between presets

  // Read-only JSON peek — defaults on when the config can't be parsed (the
  // visual canvas has nothing to render) so the raw file is still visible.
  const [showJson, setShowJson] = useState<boolean>(!(isPipeline || isLoop))
  const [workflowConfig, setWorkflowConfig] = useState<PresetWorkflowConfig | null>(() =>
    isPipeline && isPipelineConfigShape(preset.config)
      ? { description: preset.config.description, steps: preset.config.steps }
      : null,
  )
  const [loopConfig, setLoopConfig] = useState<PresetLoopConfig | null>(() =>
    isLoop && isLoopConfigShape(preset.config) ? preset.config : null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setShowJson(!(isPipeline || isLoop))
    setWorkflowConfig(
      isPipeline && isPipelineConfigShape(preset.config)
        ? { description: preset.config.description, steps: preset.config.steps }
        : null,
    )
    setLoopConfig(
      isLoop && isLoopConfigShape(preset.config) ? preset.config : null,
    )
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey])

  // Live status from the in-progress draft (visual mode), falling back to the
  // last saved config — so the badge flips to valid as fields are completed.
  const liveConfig: PresetConfig | undefined =
    (isPipeline ? workflowConfig : isLoop ? loopConfig : null) ?? preset.config
  const { status, issues } = presetStatus(liveConfig)

  // Report the live status upward. `presetStatus` builds a fresh issues array
  // every render, so gate on CONTENT (joined key) — otherwise the parent
  // setState would re-render us and loop forever.
  const lastLiveKey = useRef('')
  const liveKey = `${status}\u0000${issues.join('\u0000')}`
  useEffect(() => {
    if (lastLiveKey.current === liveKey) return
    lastLiveKey.current = liveKey
    onLiveStatus?.({ status, issues })
  }, [liveKey, status, issues, onLiveStatus])

  // The FULL stored file shape (version, name, type, config) — the read-only
  // JSON view renders this, so the version is visible in the json.
  const fileJson =
    preset.config === undefined
      ? null
      : JSON.stringify(
          {
            version: preset.version ?? 1,
            type: preset.type ?? 'loop',
            name: preset.name,
            config: preset.config,
          },
          null,
          2,
        )

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
          {(isPipeline || isLoop) && (
            <div className="flex gap-1 rounded-md border border-input p-0.5">
              <button
                type="button"
                onClick={() => setShowJson(false)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  !showJson
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Visual
              </button>
              <button
                type="button"
                onClick={() => setShowJson(true)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  showJson
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                JSON
              </button>
            </div>
          )}
          {!showJson && (
            <Button size="xs" onClick={saveVisual} disabled={createPreset.isPending || !visualReady}>
              {createPreset.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          )}
        </div>
      </div>

      {showJson ? (
        <pre
          className="w-max max-w-full cursor-text overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
          title="Read-only — edit on the visual canvas"
        >
          {fileJson !== null ? (
            fileJson
          ) : (
            <span className="text-muted-foreground">
              Preset file could not be parsed — repair it on disk. JSON editing is disabled; edit on the
              visual canvas instead.
            </span>
          )}
        </pre>
      ) : (
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
