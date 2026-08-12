import { useEffect, useState } from 'react'
import { navigate } from '@/lib/useLocation'
import { runUrl } from '@/components/LandingPage'
import { useClampedPopover } from '@/lib/useClampedPopover'
import { runTitle } from '@/lib/runTitle'
import type { NotificationItem, SkillRunState } from '@/lib/useUiSocket'
import { AlertCircle, Bell, CheckCheck, Info, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react'

/** Panel width must match the `w-80` class on the dropdown below. */
const PANEL_WIDTH = 320

/** Relative-time label, e.g. "3m ago" — same format as RunsSection. */
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

/** Icon per severity — run items swap in a Sparkles glyph via `runId`. */
const iconFor = (n: NotificationItem) => {
  switch (n.level) {
    case 'error':
      return AlertCircle
    case 'warning':
      return TriangleAlert
    default:
      return Info
  }
}

const colorFor = (n: NotificationItem): string => {
  switch (n.level) {
    case 'error':
      return 'text-red-500'
    case 'warning':
      return 'text-amber-500'
    default:
      return 'text-sky-500'
  }
}

interface NotificationsProps {
  notifications: NotificationItem[]
  /** Run states — resolved to titles for run-lifecycle entries. */
  runs: Record<string, SkillRunState>
  onDismiss: (id: string) => void
  onMarkAllRead: () => void
  onClearAll: () => void
}

/**
 * Header notification center — one entry per agentic-run state change
 * (started, finished, needs your answer, errored). Clicking a run entry
 * navigates to the run page. Opening the panel marks everything read.
 */
export function Notifications({ notifications, runs, onDismiss, onMarkAllRead, onClearAll }: NotificationsProps) {
  const [open, setOpen] = useState(false)
  // The bell sits near the right viewport edge, so anchor the panel's right
  // edge to the trigger and clamp it inside the viewport.
  const { triggerRef, panelLeft } = useClampedPopover(open, PANEL_WIDTH, 0, 8, 'right')

  const unread = notifications.filter((n) => !n.read).length

  // Opening the panel (or new items arriving while it's open) marks all read.
  useEffect(() => {
    if (open && unread > 0) onMarkAllRead()
  }, [open, unread, onMarkAllRead])

  const openRun = (runId: string): void => {
    setOpen(false)
    navigate(runUrl(runId))
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Notifications"
        className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bell className="size-3.5" />
        Notifications
        {unread > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{ left: panelLeft }}
            className="absolute z-40 mt-1.5 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold">Notifications</span>
              <span className="text-[10px] text-muted-foreground">
                {unread > 0 ? `${unread} unread` : 'all read'}
              </span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3" />
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No notifications yet — run an agentic skill and watch it here.
              </p>
            ) : (
              <>
                <ul className="max-h-96 overflow-y-auto py-1">
                  {notifications.map((n) => {
                    const isRun = n.runId !== undefined
                    const Icon = isRun ? Sparkles : iconFor(n)
                    const run = isRun ? runs[n.runId!] : undefined
                    return (
                      <li key={n.id} className={n.read ? '' : 'bg-primary/[0.04]'}>
                        <div className="flex items-start gap-2.5 px-3 py-2">
                          <Icon className={`mt-0.5 size-3.5 shrink-0 ${colorFor(n)}`} />
                          <button
                            type="button"
                            onClick={isRun ? () => openRun(n.runId!) : undefined}
                            disabled={!isRun}
                            title={isRun ? 'Open run' : undefined}
                            className={`min-w-0 flex-1 text-left ${isRun ? 'cursor-pointer hover:underline' : 'cursor-default'}`}
                          >
                            <span className="block text-xs font-medium">{n.message}</span>
                            {run !== undefined && (
                              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                {runTitle(run)}
                              </span>
                            )}
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {timeAgo(n.ts)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDismiss(n.id)}
                            title="Dismiss"
                            className="mt-0.5 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Trash2 className="size-3" />
                  Clear all
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
