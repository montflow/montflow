import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { TableEmptyState } from '@/components/TableEmptyState'
import { ALL_RUN_STATUSES, useRuns, type RunStatusFilter } from '@/lib/useRuns'
import { useWorkspacePrefs } from '@/lib/useWorkspacePrefs'
import { runUrl } from '@/components/LandingPage'
import { navigate, setSearchParams, useSearchParams } from '@/lib/useLocation'
import type { RunSummary } from '@/protocol'
import { Activity, CircleAlert, Loader2, MessageCircle, Terminal, XCircle } from 'lucide-react'

interface RunsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  /** Deep link (?section=runs) — force the panel open when navigating here. */
  reveal?: boolean
}

/** Status badge styling — mirrors the RunPage status colors. */
const STATUS_META: Record<
  RunStatusFilter,
  { label: string; className: string; Icon: typeof Loader2 }
> = {
  running: { label: 'running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', Icon: Loader2 },
  done: { label: 'done', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: Activity },
  awaiting: { label: 'awaiting', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: MessageCircle },
  interrupted: { label: 'interrupted', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: CircleAlert },
  error: { label: 'error', className: 'bg-red-500/15 text-red-600 dark:text-red-400', Icon: XCircle },
}

/** Compact relative-time label, e.g. "3m ago", "2h ago", "4d ago". */
const timeAgo = (ts: number): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function RunsSection({ workspaceId, conn, id, reveal }: RunsSectionProps) {
  // Panel open state is persisted per workspace (status filters live in the URL).
  const [prefs, setPrefs] = useWorkspacePrefs(workspaceId, 'runs')

  // Deep-link reveal: a breadcrumb section link (?section=runs) opens a
  // collapsed panel so the scroll lands on visible content.
  useEffect(() => {
    if (reveal === true) setPrefs({ open: true })
  }, [reveal, setPrefs])

  // Status filters live in the URL (?rs=done,error) so they survive navigation.
  const params = useSearchParams()
  const selected = useMemo(
    () =>
      (params.get('rs') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is RunStatusFilter => (ALL_RUN_STATUSES as readonly string[]).includes(s)),
    [params],
  )
  const { data: runs, isPending, isFetching, isError, error, refetch } = useRuns(
    workspaceId,
    selected,
    conn,
  )

  const toggle = (status: RunStatusFilter): void => {
    const next = selected.includes(status)
      ? selected.filter((s) => s !== status)
      : [...selected, status]
    const url = new URLSearchParams(params)
    if (next.length === 0) url.delete('rs')
    else url.set('rs', next.join(','))
    setSearchParams(url)
  }

  return (
    <CollapsibleSection
      id={id}
      title="Runs"
      icon={<Terminal className="size-5" />}
      open={prefs.open}
      onOpenChange={(open) => setPrefs({ open })}
    >
      {isError && (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-500">
          <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isPending ? (
        <RunsTableSkeleton />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ALL_RUN_STATUSES.map((status) => {
              const meta = STATUS_META[status]
              const active = selected.includes(status)
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggle(status)}
                  aria-pressed={active}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  <span className={`mr-1 inline-block size-1.5 rounded-full align-middle ${meta.className.split(' ')[0]}`} />
                  {meta.label}
                </button>
              )
            })}
          </div>

          <p className="mb-2 text-[11px] text-muted-foreground">
            {isFetching && (
              <>
                <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-primary/60 align-middle" />
                Refreshing runs…
              </>
            )}
            {!isFetching && `${runs?.length ?? 0} run${(runs?.length ?? 0) === 1 ? '' : 's'}`}
          </p>

          <div className="relative h-96 overflow-y-auto rounded-md border">
            {runs?.length === 0 ? (
              selected.length > 0 ? (
                <TableEmptyState
                  icon={<Terminal className="size-4" />}
                  message="No runs match the selected statuses."
                />
              ) : (
                <TableEmptyState
                  icon={<Terminal className="size-4" />}
                  message="No runs yet"
                  hint="Create a skill, profile, or preset with the agent and it appears here."
                />
              )
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b">
                    <th className="w-[62%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Run
                    </th>
                    <th className="w-[18%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="w-[20%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((run) => {
                    const target = runUrl(run.runId) + location.search
                    const meta = STATUS_META[run.status]
                    const StatusIcon = meta.Icon
                    return (
                      <tr
                        key={run.runId}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(target)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(target)
                          }
                        }}
                        className="group cursor-pointer border-b outline-none last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40"
                      >
                        <td className="px-3 py-2 align-middle">
                          <RunTitle run={run} />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}
                          >
                            <StatusIcon className={`size-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                          {timeAgo(run.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}

/** Run title: the generated title when ready, else the first user prompt; falls back to the run id. */
function RunTitle({ run }: { run: RunSummary }) {
  const title = (run.title ?? run.prompt).trim().replace(/\s+/g, ' ')
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-medium underline-offset-4 group-hover:underline" title={title}>
        {title === '' ? run.runId : title}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
        {run.runId.slice(0, 8)} · {run.entryCount} msgs · {run.toolCount} tools
      </p>
    </div>
  )
}

function RunsTableSkeleton() {
  return (
    <div className="h-96 overflow-hidden rounded-md border">
      <div className="flex items-center border-b px-3 py-2">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-10 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
