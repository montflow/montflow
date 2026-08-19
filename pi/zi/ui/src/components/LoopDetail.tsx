import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LOOP_STATUS_META } from '@/lib/loopStatus'
import { useDeleteLoop, useLoopDetail, useResumeLoop, useStopLoop } from '@/lib/useLoops'
import { loopUrl, runUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { LoopAgent, LoopAgentKind, LoopDetail as LoopDetailData, LoopHistoryEntry } from '@/protocol'
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CircleStop,
  History,
  Loader2,
  MessageCircle,
  Play,
  Repeat,
  Trash2,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

interface LoopDetailProps {
  workspaceId: string
  /** Loop id from the URL (/w/<id>/loops/<loop-id>/). */
  loopId: string
  conn: 'connecting' | 'open' | 'closed'
}

/** Icon per agent role, for the active-agent cards. */
const AGENT_ICONS: Record<LoopAgentKind, LucideIcon> = {
  supervisor: BrainCircuit,
  reviewer: Users,
  fixer: Wrench,
  human: MessageCircle,
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

export function LoopDetail({ workspaceId, loopId, conn }: LoopDetailProps) {
  const { data: loop, isPending, isError, error, refetch } = useLoopDetail(workspaceId, loopId, conn)
  const stopLoop = useStopLoop(workspaceId)
  const deleteLoop = useDeleteLoop(workspaceId)
  const resumeLoop = useResumeLoop(workspaceId)
  const [confirmStop, setConfirmStop] = useState(false)

  const running = loop?.running ?? false
  const meta = loop !== null ? LOOP_STATUS_META[loop.status] : null
  const StatusIcon = meta?.Icon ?? Loader2
  // Full roster of agents that work on this loop (supervisor + reviewers),
  // kept after the loop finishes so every agent's run stays one click away.
  const roster = loop?.roster ?? loop?.agents ?? []
  // Where a clicked agent's run should bounce back to — the loop detail.
  const backTo = loopUrl(workspaceId, loopId)

  const back = (): void => navigate(workspaceUrl(workspaceId))
  const stop = (): void => {
    if (loopId === null || stopLoop.isPending) return
    stopLoop.mutate(loopId)
  }
  const remove = (): void => {
    if (loopId === null || deleteLoop.isPending) return
    if (!window.confirm(`Delete loop "${titleFromSlug(loopId)}"? This cannot be undone.`)) return
    deleteLoop.mutate(loopId, {
      onSuccess: () => navigate(workspaceUrl(workspaceId)),
    })
  }

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={back}
          className="mb-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to workspace
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <span className="truncate">{titleFromSlug(loopId)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600 dark:text-blue-400">
                <Repeat className="size-3" />
                loop
              </span>
            </h1>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{loopId}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {loop?.preset !== undefined && (
                <Badge variant="secondary" title="Preset this loop is running">
                  preset: {loop.preset}
                </Badge>
              )}
              {loop !== null && meta !== null && (
                <Badge className={meta.className} title="Current lifecycle status">
                  <StatusIcon className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
                  {meta.label}
                  {running && (
                    <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  )}
                </Badge>
              )}
            </div>
          </div>

          {running ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500 dark:border-red-500/40"
              onClick={() => setConfirmStop(true)}
              disabled={conn !== 'open'}
              title="Stop the loop — interrupt the running agents"
            >
              <CircleStop className="size-3.5" />
              Stop
            </Button>
          ) : (
            <>
              {loop !== null && loop.status !== 'done' && !resumeLoop.isPending && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resumeLoop.mutate(loopId)}
                  disabled={conn !== 'open'}
                  title="Resume from the last recorded step"
                  className="shrink-0"
                >
                  {resumeLoop.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  Resume
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500 dark:border-red-500/40"
                onClick={remove}
                disabled={deleteLoop.isPending}
                title="Delete this stopped loop"
              >
                {deleteLoop.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Delete
              </Button>
            </>
          )}
        </div>

        {isError && (
          <div className="mt-4 flex items-center gap-2 text-xs text-red-500">
            <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
            <Button size="xs" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}

        {isPending ? (
          <LoopDetailSkeleton />
        ) : loop === null ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">
            Loop not found in this workspace.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {/* Status / progress */}
            <StatusCard loop={loop} />

            {/* Agents — everyone that works on the loop; click to open their run/thoughts */}
            <section>
              <SectionHeading
                icon={<Activity className="size-4" />}
                title="Agents"
                count={roster.length}
              />
              {roster.length === 0 ? (
                <EmptyPanel message="No agents on this loop yet." />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {roster.map((agent) => (
                    <AgentCard key={agent.runId} agent={agent} backTo={backTo} />
                  ))}
                </div>
              )}
            </section>

            {/* History — completed work */}
            <section>
              <SectionHeading
                icon={<History className="size-4" />}
                title="History"
                count={loop.history.length}
              />
              {loop.history.length === 0 ? (
                <EmptyPanel message="No completed work yet." />
              ) : (
                <ol className="relative ml-1.5 space-y-2 border-l border-border pl-4">
                  {loop.history.map((entry, index) => (
                    <HistoryRow key={index} entry={entry} backTo={backTo} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>

      <StopLoopDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        onConfirm={() => {
          setConfirmStop(false)
          stop()
        }}
        pending={stopLoop.isPending}
      />
    </main>
  )
}

/** Status + progress overview card. */
function StatusCard({ loop }: { loop: LoopDetailData }) {
  const StatusIcon = LOOP_STATUS_META[loop.status].Icon
  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${LOOP_STATUS_META[loop.status].className}`}
          >
            <StatusIcon
              className={`size-3 ${loop.running ? 'animate-spin' : ''}`}
            />
            {LOOP_STATUS_META[loop.status].label}
          </span>
        </p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Progress
        </p>
        <p className="mt-1 text-sm font-medium">
          {loop.loop !== undefined ? (
            <>
              loop {loop.loop}
              {loop.cycle !== undefined && <span> · cycle {loop.cycle}</span>}
              <span className="text-muted-foreground">
                {' '}
                of {loop.maxLoops ?? '?'}
                {loop.maxCycles !== undefined && `×${loop.maxCycles}`}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Updated
        </p>
        <p className="mt-1 text-sm font-medium" title={new Date(loop.updatedAt).toLocaleString()}>
          {timeAgo(loop.updatedAt)}
        </p>
      </div>
    </div>
  )
}

/** A clickable agent card — opens the agent's run page (live stream/thoughts). */
function AgentCard({ agent, backTo }: { agent: LoopAgent; backTo: string }) {
  const Icon = AGENT_ICONS[agent.kind]
  return (
    <button
      type="button"
      onClick={() => navigate(`${runUrl(agent.runId)}?from=${encodeURIComponent(backTo)}`)}
      title={`Open ${agent.label} — the run page shows its live thoughts`}
      className="group flex items-center gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{agent.label}</span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {agent.model ?? agent.runId.slice(0, 8)}
        </span>
      </span>
      {agent.running ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
          <Loader2 className="size-3 animate-spin" />
          working
        </span>
      ) : (
        <OutcomeBadge outcome={agent.outcome ?? 'ok'} />
      )}
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

function OutcomeBadge({ outcome }: { outcome: 'ok' | 'error' | 'interrupted' }) {
  const meta =
    outcome === 'ok'
      ? { label: 'done', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
      : outcome === 'error'
        ? { label: 'error', className: 'bg-red-500/10 text-red-500' }
        : { label: 'interrupted', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}

/** One timeline row of completed work. */
function HistoryRow({ entry, backTo }: { entry: LoopHistoryEntry; backTo: string }) {
  return (
    <li className="relative">
      <span className="absolute -left-[19px] top-2.5 size-2.5 rounded-full border-2 border-background bg-primary/70" />
      <div className="rounded-md border bg-card p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium">{entry.title}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(entry.at)}</span>
        </div>
        {entry.detail !== undefined && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.detail}</p>
        )}
        {entry.runId !== undefined && (
          <button
            type="button"
            onClick={() => navigate(`${runUrl(entry.runId!)}?from=${encodeURIComponent(backTo)}`)}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            Open run
            <ArrowRight className="size-3" />
          </button>
        )}
      </div>
    </li>
  )
}

/** Section title with a count badge. */
function SectionHeading({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count: number
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/10 p-8 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function LoopDetailSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="h-20 animate-pulse rounded-md border bg-muted/50" />
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-md border bg-muted/50" />
          <div className="h-16 animate-pulse rounded-md border bg-muted/50" />
        </div>
      </div>
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-md border bg-muted/50" />
    </div>
  )
}

/** Confirm before force-stopping a running loop. */
function StopLoopDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop this loop?</DialogTitle>
          <DialogDescription>
            This interrupts the running agents and pauses the loop at its last recorded step. You can
            resume it later, or delete it once stopped.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CircleStop className="size-3.5" />}
            Stop loop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
