import { useMemo, useState } from 'react'
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
import { ModelSelect } from '@/components/ModelSelect'
import { useBuiltinReviewers, useCreatePreset, useDeletePreset, usePresetDetail } from '@/lib/usePresets'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { profileUrl, runUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { PresetConfig, PresetSummary } from '@/protocol'
import {
  Braces,
  CircleAlert,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
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
  const { data: builtins } = useBuiltinReviewers(conn)
  const builtinById = useMemo(
    () => new Map((builtins ?? []).map((b) => [b.id, b.label])),
    [builtins],
  )

  const [modifyOpen, setModifyOpen] = useState(false)
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
          <PresetHeader
            preset={preset}
            builtinById={builtinById}
            workspaceId={workspaceId}
            onModify={() => setModifyOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <PresetConfigView
            preset={preset}
            workspaceId={workspaceId}
            onSaved={() =>
              void queryClient.invalidateQueries({ queryKey: ['presets', workspaceId] })
            }
          />
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Preset not found.</p>
      )}

      <ModifyPresetDialog
        preset={preset}
        folder={folder}
        conn={conn}
        open={modifyOpen}
        onOpenChange={setModifyOpen}
      />

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
  builtinById,
  workspaceId,
  onModify,
  onDelete,
}: {
  preset: PresetSummary
  builtinById: Map<string, string>
  workspaceId: string
  onModify: () => void
  onDelete: () => void
}) {
  const config = preset.config
  const reviewers = config?.reviewers ?? []
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
              {reviewers.map((ref, index) =>
                ref.type === 'builtin' ? (
                  <Badge key={index} variant="secondary" title={`Builtin reviewer: ${ref.id ?? '?'}`}>
                    {builtinById.get(ref.id ?? '?') ?? ref.id ?? '?'}
                  </Badge>
                ) : (
                  <Badge
                    key={index}
                    variant="outline"
                    asChild
                    className="hover:border-primary/40 hover:text-foreground"
                  >
                    <a
                      href={profileUrl(workspaceId, ref.name ?? '')}
                      title={`Profile reviewer: ${ref.name ?? '?'}`}
                      onClick={(event) => {
                        event.preventDefault()
                        navigate(profileUrl(workspaceId, ref.name ?? ''))
                      }}
                    >
                      {ref.name ?? '?'}
                    </a>
                  </Badge>
                ),
              )}
              <Badge variant="secondary" title="Supervisor model">
                <Sparkles className="size-3" />
                <span className="font-mono">{config.supervisor.model}</span>
              </Badge>
              <Badge variant="secondary" title="Fixer model">
                <RefreshCw className="size-3" />
                <span className="font-mono">{config.fixerModel}</span>
              </Badge>
              <Badge variant="secondary" title="Review loops × cycles per loop">
                {config.maxLoops}
                <span className="text-muted-foreground">×</span>
                {config.maxCycles ?? config.maxLoops}
              </Badge>
              <Badge variant="outline" title="Deadlock handling">
                flip after {config.deadlock.flipThreshold} · {config.deadlock.action}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={onModify}>
            <Sparkles className="size-3.5" />
            Modify
          </Button>
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
    </div>
  )
}

/**
 * Config JSON, click-to-edit inline. Clicking the JSON switches it to a
 * textarea with Save / Discard — no separate edit dialog or button.
 */
function PresetConfigView({
  preset,
  workspaceId,
  onSaved,
}: {
  preset: PresetSummary
  workspaceId: string
  onSaved: () => void
}) {
  const createPreset = useCreatePreset(workspaceId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const start = (): void => {
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
    if (typeof config !== 'object' || config === null || !Array.isArray(config.reviewers)) {
      setError('Config must be a JSON object with a "reviewers" array.')
      return
    }
    createPreset.mutate(
      { name: preset.name, config },
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

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Braces className="size-4" />
          Config
        </h2>
        {editing && (
          <div className="flex gap-2">
            <Button size="xs" variant="outline" onClick={discard} disabled={createPreset.isPending}>
              Discard
            </Button>
            <Button size="xs" onClick={save} disabled={createPreset.isPending}>
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
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            autoFocus
            className="min-h-80 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {error !== null && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </>
      ) : (
        <pre
          role="button"
          tabIndex={0}
          onClick={start}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              start()
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

/** Agentic modify — kicks off an isolated agent run that edits the preset in place. */
function ModifyPresetDialog({
  preset,
  folder,
  conn,
  open,
  onOpenChange,
}: {
  preset: PresetSummary | null
  folder: string | null
  conn: 'connecting' | 'open' | 'closed'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { sendCommand } = useUiSocket()
  const modelsQuery = useModels(conn)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  // Re-arm the dialog each time it opens: preselect the header picker model
  // and describe the preset the run will modify.
  const start = (): void => {
    setModel(modelsQuery.data?.selected ?? null)
    setPrompt(describePreset(preset))
    setAgenticError(null)
  }

  const generate = (): void => {
    if (prompt.trim() === '' || preset === null) return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'presetAgentic',
      runId,
      text: prompt.trim(),
      model: model ?? undefined,
      presetName: preset.name,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) start()
        else onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modify {titleFromSlug(preset?.name ?? 'preset')}</DialogTitle>
          <DialogDescription>
            An agent runs in the live session, reads the preset file, applies your change, and
            writes it back — streamed to the session page where you can answer back.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="modify-prompt" className="text-xs font-medium text-muted-foreground">
              Change
            </label>
            <textarea
              id="modify-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-40 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {folder === null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Workspace not connected — agentic modification needs a running /montflow session.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="modify-model" className="text-xs font-medium text-muted-foreground">
                Model
              </label>
              <ModelSelect conn={conn} value={model} onChange={setModel} />
            </div>
            {agenticError !== null && <p className="text-xs text-red-500">{agenticError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={prompt.trim() === '' || preset === null}>
            <Sparkles className="size-3.5" />
            Run agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/** One-line summary of the current preset, used to seed the modify prompt. */
const describePreset = (preset: PresetSummary | null): string => {
  if (preset === null || preset.config === undefined) return ''
  const { reviewers, supervisor, fixerModel, maxLoops, maxCycles, deadlock } = preset.config
  const reviewerText = reviewers
    .map((ref) =>
      ref.type === 'builtin' ? `builtin:${ref.id ?? '?'}` : `profile:${ref.name ?? '?'}`,
    )
    .join(', ')
  return `Modify the preset '${preset.name}'. It currently has reviewers [${reviewerText}], supervisor on ${supervisor.model}, fixer on ${fixerModel}, ${maxLoops} loops (${maxCycles ?? maxLoops} cycles each), deadlock flip after ${deadlock.flipThreshold}.`
}
