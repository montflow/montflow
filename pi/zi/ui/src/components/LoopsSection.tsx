import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { TableEmptyState } from '@/components/TableEmptyState'
import { useLoops } from '@/lib/useLoops'
import { LOOP_STATUS_META } from '@/lib/loopStatus'
import { useWorkspacePrefs } from '@/lib/useWorkspacePrefs'
import { NewLoopDialog } from '@/components/NewLoopDialog'
import { loopUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import { Plus, Repeat } from 'lucide-react'

interface LoopsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands; null when the workspace is offline. */
  folder: string | null
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  /** Deep link (?section=loops) — force the panel open when navigating here. */
  reveal?: boolean
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

export function LoopsSection({ workspaceId, conn, folder, id, reveal }: LoopsSectionProps) {
  // Panel open state is persisted per workspace.
  const [prefs, setPrefs] = useWorkspacePrefs(workspaceId, 'loops')
  const [kickOpen, setKickOpen] = useState(false)

  // Deep-link reveal: a breadcrumb section link (?section=loops) opens a
  // collapsed panel so the scroll lands on visible content.
  useEffect(() => {
    if (reveal === true) setPrefs({ open: true })
  }, [reveal, setPrefs])

  const { data: loops, isPending, isFetching, isError, error, refetch } = useLoops(workspaceId, conn)
  const runningCount = useMemo(() => (loops ?? []).filter((loop) => loop.running).length, [loops])

  return (
    <CollapsibleSection
      id={id}
      title="Loops"
      icon={<Repeat className="size-5" />}
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
        <LoopsTableSkeleton />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {runningCount > 0 ? (
                <>
                  <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-emerald-500/70 align-middle" />
                  {runningCount} running
                </>
              ) : (
                `${loops?.length ?? 0} loop${(loops?.length ?? 0) === 1 ? '' : 's'}${(loops?.length ?? 0) > 0 && isFetching ? ' · refreshing…' : ''}`
              )}
            </p>
            <Button size="sm" onClick={() => setKickOpen(true)}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>

          {/* Fixed height in every state so panel open/close never jumps. */}
          <div className="relative h-96 overflow-y-auto rounded-md border">
            {(loops ?? []).length === 0 ? (
              <TableEmptyState
                icon={<Repeat className="size-4" />}
                message="No loops yet"
                hint="Kick off a review loop and it appears here with its status and progress."
              />
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b">
                    <th className="w-[50%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Loop
                    </th>
                    <th className="w-[30%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="w-[20%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(loops ?? []).map((loop) => {
                    const target = loopUrl(workspaceId, loop.id) + location.search
                    const meta = LOOP_STATUS_META[loop.status]
                    const StatusIcon = meta.Icon
                    return (
                      <tr
                        key={loop.id}
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
                          <p className="truncate text-[13px] font-medium underline-offset-4 group-hover:underline">
                            {titleFromSlug(loop.id)}
                          </p>
                          {loop.preset !== undefined && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                              {loop.preset}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className="flex items-center gap-1.5">
                            {loop.running && (
                              <span
                                className="size-1.5 animate-pulse rounded-full bg-emerald-500"
                                title="Running"
                              />
                            )}
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${meta.className}`}
                            >
                              <StatusIcon className={`size-3 ${loop.running ? 'animate-pulse' : ''}`} />
                              {meta.label}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                          {timeAgo(loop.updatedAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <NewLoopDialog
            workspaceId={workspaceId}
            conn={conn}
            folder={folder}
            open={kickOpen}
            onOpenChange={setKickOpen}
          />
        </>
      )}
    </CollapsibleSection>
  )
}

function LoopsTableSkeleton() {
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
