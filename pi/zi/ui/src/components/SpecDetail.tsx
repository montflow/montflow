import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AiInput } from '@/components/AiInput'
import { ModelSelect } from '@/components/ModelSelect'
import { InfoTip } from '@/components/ui/tooltip'
import { SpecGraph } from '@/components/SpecGraph'
import { runUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { useModels } from '@/lib/useModels'
import {
  useSpecDetail,
  useDeleteSpec,
  useGeneratePhases,
  useSetScopePrompt,
} from '@/lib/useSpecs'
import { useRuns, ALL_RUN_STATUSES } from '@/lib/useRuns'
import type { RunSummary } from '@/protocol'
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CircleCheck,
  CircleDashed,
  CircleDotDashed,
  FileText,
  History,
  Loader2,
  Play,
  Trash2,
} from 'lucide-react'

interface SpecDetailProps {
  workspaceId: string
  specName: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

/**
 * Wraps a scope description in the spec.md marker block, replacing any
 * existing scope-prompt range or appending the section when absent.
 */
const withScope = (markdown: string, scope: string): string => {
  const block = `<!-- scope-prompt:start -->\n${scope}\n<!-- scope-prompt:end -->`
  if (markdown.includes('<!-- scope-prompt:start -->')) {
    return markdown.replace(
      /<!-- scope-prompt:start -->[\s\S]*?<!-- scope-prompt:end -->/,
      block,
    )
  }
  return `${markdown.replace(/\s*$/, '')}\n\n## Scope prompt\n\n${block}\n`
}

/**
 * Feature-spec detail page — the pipeline graph (phase zones → task nodes,
 * status-driven, polled) plus the spec header. Draft specs surface a Begin
 * button that opens the kickoff-agent modal; the agent grills via the
 * workspace's grilling skill, then scaffolds phase A. The authoring editors
 * (scope prompt editor, bookkeeping model pickers, manual add forms) are the
 * remaining build step 4 work (wiki feature-specs.md §8).
 */
export function SpecDetail({ workspaceId, specName, conn, folder }: SpecDetailProps) {
  const { data: spec, isPending, isError, error } = useSpecDetail(workspaceId, specName, conn)
  const deleteSpec = useDeleteSpec(workspaceId)
  const generate = useGeneratePhases(workspaceId)
  const setScope = useSetScopePrompt(workspaceId)

  const [beginOpen, setBeginOpen] = useState(false)
  const [feature, setFeature] = useState('')
  const [genError, setGenError] = useState<string | null>(null)
  // Actor-model overrides — null until the user changes one; the displayed
  // value always falls back to the current selection (AiInput behavior).
  const [bkOverride, setBkOverride] = useState<string | null>(null)
  const [orchOverride, setOrchOverride] = useState<string | null>(null)
  const [execOverride, setExecOverride] = useState<string | null>(null)
  // Same source of truth as AiInput: the currently selected model, sent
  // CONCRETELY so the run never depends on router-side fallback chains.
  const modelsQuery = useModels(conn)

  // Re-arm the modal each time it opens — input starts EMPTY; actor-model
  // overrides reset so they re-seed from the current selection.
  useEffect(() => {
    if (beginOpen) {
      setBkOverride(null)
      setOrchOverride(null)
      setExecOverride(null)
      setGenError(null)
    }
  }, [beginOpen])

  // Seed chain: explicit override → selected model → session current →
  // first pickable. Always shows something concrete once models load.
  const seedModel =
    modelsQuery.data?.selected ??
    modelsQuery.data?.models.find((m) => m.isCurrent)?.id ??
    modelsQuery.data?.models[0]?.id ??
    null
  // Bookkeeper seeds from the spec's saved bookkeeping model when present.
  const effectiveBkModel = bkOverride ?? (spec?.bookkeepingModel || seedModel)
  const effectiveOrchModel = orchOverride ?? seedModel
  const effectiveExecModel = execOverride ?? seedModel

  const starting = generate.isPending || setScope.isPending

  const backTo = `/w/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(specName)}/`

  // Runs belonging to THIS spec — kickoff prompts start with a machine
  // marker naming the spec (wrapSpecPrompt's first line).
  const { data: allRuns } = useRuns(workspaceId, ALL_RUN_STATUSES, conn)
  const specRuns = useMemo(() => {
    return (allRuns ?? []).filter((run) => {
      if (!run.prompt.startsWith('Spec to author:')) return false
      return run.prompt.split('\n', 1)[0] === `Spec to author: ${specName}`
    })
  }, [allRuns, specName])
  // Active agents = kickoff runs still working or waiting for answers.
  const activeAgents = useMemo(
    () => specRuns.filter((r) => r.status === 'running' || r.status === 'awaiting'),
    [specRuns],
  )

  const onGenerate = (): void => {
    const described = feature.trim()
    if (described === '' || spec === undefined || starting) return
    setGenError(null)
    // Persist the description as the spec's scope prompt, then launch the
    // kickoff agent — it plans from the scope verbatim.
    setScope.mutate(
      { name: specName, markdown: withScope(spec.markdown, described) },
      {
        onSuccess: () => {
          generate.mutate(
            {
              name: specName,
              bookkeepingModel: effectiveBkModel ?? undefined,
              orchestratorModel: effectiveOrchModel ?? undefined,
              executorModel: effectiveExecModel ?? undefined,
            },
            {
              onSuccess: ({ runId }) => {
                setBeginOpen(false)
                navigate(
                  `${runUrl(runId)}?from=${encodeURIComponent(`/w/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(specName)}/`)}`,
                )
              },
              onError: (e) =>
                setGenError(e instanceof Error ? e.message : 'Failed to start the kickoff agent'),
            },
          )
        },
        onError: (e) => setGenError(e instanceof Error ? e.message : 'Failed to save the scope prompt'),
      },
    )
  }

  const onDelete = (): void => {
    if (
      window.confirm(
        `Delete spec "${specName}"?\n\nRemoves .agents/@montflow/specs/${specName}/ including all phases and tasks. This cannot be undone.`,
      )
    ) {
      deleteSpec.mutate(specName, {
        onSuccess: () => navigate(workspaceUrl(workspaceId)),
      })
    }
  }

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-4">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-baseline gap-x-2 text-lg font-semibold">
            <span className="font-mono">{specName}</span>
            {spec !== undefined &&
              (spec.status === 'planning' ? (
                <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <CircleDotDashed className="size-3 animate-pulse" />
                  planning
                </Badge>
              ) : spec.status === 'pending' ? (
                <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                  <CircleDashed className="size-3" />
                  pending
                </Badge>
              ) : spec.status === 'active' ? (
                <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300">
                  <CircleDotDashed className="size-3" />
                  active
                </Badge>
              ) : spec.status === 'complete' ? (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CircleCheck className="size-3" />
                  complete
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <CircleDashed className="size-3" />
                  draft
                </Badge>
              ))}
          </h1>
          <div className="flex items-center gap-2">
            {spec?.status === 'draft' && (
              <Button size="sm" onClick={() => setBeginOpen(true)}>
                <Play className="size-3.5" />
                Begin
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onDelete} disabled={deleteSpec.isPending}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </header>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError || spec === undefined ? (
          <p className="text-sm text-red-500">
            {error instanceof Error ? error.message : 'Spec not found — it may have been deleted.'}
          </p>
        ) : (
          <>
            {spec.status === 'draft' && spec.scopePrompt.trim() === '' && (
              <div className="mb-6 flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <FileText className="mt-0.5 size-4 shrink-0" />
                <p>
                  This spec is an empty draft. Press{' '}
                  <span className="font-medium text-foreground">Begin</span> to describe the
                  feature — the kickoff agent grills you about anything vague, then scaffolds
                  phase A (planning + exploration tasks).
                </p>
              </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Phases</p>
                <p className="mt-1 font-mono text-lg">{spec.phaseCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tasks</p>
                <p className="mt-1 font-mono text-lg">{spec.taskCount}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
                <p className="mt-1 font-mono text-sm">{spec.created === '' ? '—' : spec.created}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bookkeeper model</p>
                <p className="mt-1 truncate font-mono text-sm">{spec.model === '' ? 'not set' : spec.model}</p>
              </div>
            </div>

            <SpecGraph spec={spec} />

            {/* Active agents — kickoff runs working or awaiting answers */}
            <section className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-muted-foreground">
                  <Activity className="size-4" />
                </span>
                <h2 className="text-sm font-semibold text-muted-foreground">Active agents</h2>
                {activeAgents.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                    {activeAgents.length}
                  </span>
                )}
              </div>
              {activeAgents.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
                  No agents working on this spec right now.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeAgents.map((run) => (
                    <SpecAgentCard key={run.runId} run={run} backTo={backTo} />
                  ))}
                </div>
              )}
            </section>

            {/* Runs — every kickoff run ever started for this spec */}
            <section className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-muted-foreground">
                  <History className="size-4" />
                </span>
                <h2 className="text-sm font-semibold text-muted-foreground">Runs</h2>
                {specRuns.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                    {specRuns.length}
                  </span>
                )}
              </div>
              {specRuns.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
                  No runs yet — press Begin to start the kickoff agent.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {specRuns.map((run) => (
                    <SpecRunRow key={run.runId} run={run} backTo={backTo} />
                  ))}
                </div>
              )}
            </section>

            {spec.scopePrompt.trim() !== '' && (
              <section className="mt-6">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <FileText className="size-4" />
                  Scope prompt
                </h2>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-3 font-mono text-xs text-muted-foreground">
                  {spec.scopePrompt}
                </pre>
              </section>
            )}

            <div className="mt-8 flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <FileText className="mt-0.5 size-4 shrink-0" />
              <p>
                Editing surfaces — scope-prompt editor, bookkeeping model pickers, manual phase/task
                forms — are the remaining step 4 work (wiki feature-specs.md §8). Until then, author
                files by hand under{' '}
                <span className="font-mono">.agents/@montflow/specs/{spec.name}/</span>; this page
                picks up the changes automatically.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Kickoff-agent launch modal — opened by Begin on draft specs. */}
      <Dialog open={beginOpen} onOpenChange={setBeginOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Describe feature</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <AiInput
              value={feature}
              onChange={setFeature}
              folder={folder}
              label="Describe feature"
              prompt={
                'Write a scope for a feature spec — an agent will plan its phases and tasks from it.\nCover goals, success criteria, constraints, and what is out of scope. Stay factual: invent nothing that is not stated or directly implied.\n\nScope:\n'
              }
              placeholder="Add GitHub OAuth login. Sessions must survive restarts…"
              className="min-h-32"
              disabled={starting}
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">Actor models</span>
                <InfoTip text="Who runs what. Each pre-selects the model you're already using — change only if this spec needs something different." />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Bookkeeper</span>
                    <InfoTip text="Flips spec/task status frontmatter when the orchestrator instructs it (wiki §11)." />
                  </div>
                  <ModelSelect conn={conn} value={effectiveBkModel} onChange={setBkOverride} hideDefault />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Orchestrator</span>
                    <InfoTip text="Runs the kickoff: grills you about vague scope, then scaffolds phase A. Later drives task sequencing." />
                  </div>
                  <ModelSelect conn={conn} value={effectiveOrchModel} onChange={setOrchOverride} hideDefault />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Executor</span>
                    <InfoTip text="Runs task bodies during execution — planning, exploration, and code-mutating execution tasks." />
                  </div>
                  <ModelSelect conn={conn} value={effectiveExecModel} onChange={setExecOverride} hideDefault />
                </div>
              </div>
            </div>
            {genError !== null && (
              <pre className="whitespace-pre-wrap rounded-md border border-red-500/30 bg-red-500/5 p-2 font-mono text-[11px] text-red-600 dark:text-red-400">
                {genError}
              </pre>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBeginOpen(false)} disabled={starting}>
              Cancel
            </Button>
            <Button onClick={onGenerate} disabled={feature.trim() === '' || starting}>
              {starting ? 'Starting…' : 'Start kickoff agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

// --- Runs & agents ----------------------------------------------------------

const timeAgo = (ts: number): string => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Status pill for a spec kickoff run. */
function RunStatusPill({ status }: { status: RunSummary['status'] }) {
  if (status === 'running') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
        <Loader2 className="size-3 animate-spin" />
        working
      </span>
    )
  }
  if (status === 'awaiting') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
        <CircleDotDashed className="size-3" />
        awaiting you
      </span>
    )
  }
  if (status === 'done') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="size-3" />
        done
      </span>
    )
  }
  if (status === 'interrupted') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        interrupted
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
      error
    </span>
  )
}

/** Clickable card for an ACTIVE kickoff run — opens its live thoughts. */
function SpecAgentCard({ run, backTo }: { run: RunSummary; backTo: string }) {
  const label = run.title !== undefined && run.title !== '' ? run.title : 'Kickoff agent'
  return (
    <button
      type="button"
      onClick={() => navigate(`${runUrl(run.runId)}?from=${encodeURIComponent(backTo)}`)}
      title="Open the run page — live thoughts, and answers when the agent grills you"
      className="group flex items-center gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <BrainCircuit className={`size-4 ${run.status === 'running' ? 'animate-pulse' : ''}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {run.runId.slice(0, 8)} · {timeAgo(run.updatedAt)}
        </span>
      </span>
      <RunStatusPill status={run.status} />
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

/** One row in the spec's run history. */
function SpecRunRow({ run, backTo }: { run: RunSummary; backTo: string }) {
  const label = run.title !== undefined && run.title !== '' ? run.title : `Kickoff agent ${run.runId.slice(0, 8)}`
  return (
    <button
      type="button"
      onClick={() => navigate(`${runUrl(run.runId)}?from=${encodeURIComponent(backTo)}`)}
      title="Open the run page"
      className="group flex w-full items-center gap-3 rounded-md border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <BrainCircuit className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {run.entryCount} messages · {run.toolCount} tool calls · {timeAgo(run.updatedAt)}
        </span>
      </span>
      <RunStatusPill status={run.status} />
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

