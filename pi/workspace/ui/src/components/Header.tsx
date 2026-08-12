import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '@/lib/useLocation'
import { runUrl } from '@/components/LandingPage'
import type { SkillRunState } from '@/lib/useUiSocket'
import { runTitle } from '@/lib/runTitle'
import { ModelPicker } from '@/components/ModelPicker'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { useClampedPopover } from '@/lib/useClampedPopover'
import { ALL_RUN_STATUSES, type RunStatusFilter } from '@/lib/useRuns'
import type { WorkspaceInfo, FolderInfo } from '@/protocol'
import { ChevronDown, Search, Sparkles, X } from 'lucide-react'

/** Statuses shown in the header dropdown by default ('done' hidden). */
const DEFAULT_VISIBLE: readonly RunStatusFilter[] = ['running', 'awaiting', 'interrupted', 'error']

/** localStorage key for the visible-status preference (global, not per workspace). */
const RUNS_FILTER_KEY = 'montflow:runs-filter'

/** Status colors — same palette as the Runs section chips/badges. */
const STATUS_META: Record<RunStatusFilter, { label: string; className: string }> = {
  running: { label: 'running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  done: { label: 'done', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  awaiting: { label: 'awaiting answer', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  interrupted: { label: 'interrupted', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  error: { label: 'error', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
}

const loadVisible = (): Set<RunStatusFilter> => {
  try {
    const raw = localStorage.getItem(RUNS_FILTER_KEY)
    if (raw === null) return new Set(DEFAULT_VISIBLE)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE)
    const statuses = parsed.filter((s): s is RunStatusFilter =>
      (ALL_RUN_STATUSES as readonly string[]).includes(s as string),
    )
    return statuses.length > 0 ? new Set(statuses) : new Set(DEFAULT_VISIBLE)
  } catch {
    return new Set(DEFAULT_VISIBLE) // storage unavailable (private mode) — best effort
  }
}

const saveVisible = (visible: Set<RunStatusFilter>): void => {
  try {
    localStorage.setItem(RUNS_FILTER_KEY, JSON.stringify([...visible]))
  } catch {
    // Storage full or unavailable — best effort only.
  }
}

interface HeaderProps {
  conn: 'connecting' | 'open' | 'closed'
  port: number | null
  /** Agentic skill runs (isolated agents) — the only thing this dropdown lists. */
  runs: Record<string, SkillRunState>
  /** For breadcrumb labels (workspace names) and the sessions/run trails. */
  workspaces: WorkspaceInfo[] | null
  folders: FolderInfo[]
}

const connLabel: Record<HeaderProps['conn'], { text: string; className: string }> = {
  connecting: { text: 'connecting…', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  open: { text: 'connected', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  closed: { text: 'disconnected', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
}

/** Panel width must match the `w-96` class on the runs dropdown below. */
const RUNS_PANEL_WIDTH = 384

export function Header({ conn, port, runs, workspaces, folders }: HeaderProps) {
  const state = connLabel[conn]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Which statuses are visible; 'done' is hidden until the user opts in.
  const [visible, setVisible] = useState<Set<RunStatusFilter>>(loadVisible)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Clamp the panel inside the viewport (same left-clipping bug as the model
  // picker — the header's dropdowns sit near the left edge).
  const { triggerRef, panelLeft } = useClampedPopover(open, RUNS_PANEL_WIDTH)

  const toggleStatus = (status: RunStatusFilter): void => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      saveVisible(next)
      return next
    })
  }

  // Focus the search box whenever the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Agentic runs — newest first (the map preserves insertion order), matched
  // against the visible statuses and the search query (runs search their full
  // transcript). An empty selection means no status filter (show all).
  const runsList = useMemo<Array<[string, SkillRunState]>>(() => {
    const list = Object.entries(runs).reverse()
    const q = query.trim().toLowerCase()
    return list.filter(([, run]) => {
      if (visible.size > 0 && !visible.has(run.status)) return false
      if (q !== '' && !run.entries.some((entry) => entry.text.toLowerCase().includes(q))) {
        return false
      }
      return true
    })
  }, [runs, query, visible])

  const noRunsAtAll = Object.keys(runs).length === 0

  const openRun = (runId: string): void => {
    setOpen(false)
    setQuery('')
    navigate(runUrl(runId))
  }

  return (
    <header className="relative border-b px-4 py-2">
      <Breadcrumbs workspaces={workspaces} folders={folders} runs={runs} />

      <div className="mt-2 flex items-center gap-3">
        <ModelPicker conn={conn} />

        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="size-3.5" />
            Runs
            {runsList.length > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {runsList.length}
              </span>
            )}
            <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div
                role="listbox"
                style={{ left: panelLeft }}
                className="absolute z-40 mt-1.5 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
              >
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <span className="text-xs font-semibold">Agentic runs</span>
                  {query !== '' && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                      Clear
                    </button>
                  )}
                </div>

                <div className="border-b px-3 py-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setOpen(false)
                        if (event.key === 'Enter' && runsList.length === 1) {
                          openRun(runsList[0]![0])
                        }
                      }}
                      placeholder="Search runs…"
                      className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ALL_RUN_STATUSES.map((status) => {
                      const meta = STATUS_META[status]
                      const active = visible.has(status)
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleStatus(status)}
                          aria-pressed={active}
                          title={active ? `Hide ${meta.label} runs` : `Show ${meta.label} runs`}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                            active
                              ? 'border-primary/50 bg-primary/10 text-foreground'
                              : 'text-muted-foreground hover:border-primary/30 hover:text-foreground'
                          }`}
                        >
                          <span
                            className={`mr-1 inline-block size-1.5 rounded-full align-middle ${meta.className.split(' ')[0]}`}
                          />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {runsList.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    {noRunsAtAll
                      ? 'No agentic runs yet — create a skill with "Ask an agent".'
                      : query !== ''
                        ? 'No runs match your search.'
                        : 'No runs match the selected statuses.'}
                  </p>
                ) : (
                  <ul className="max-h-96 overflow-y-auto py-1">
                    {runsList.map(([runId, run]) => {
                      const meta = STATUS_META[run.status]
                      const running = run.status === 'running'
                      return (
                        <li key={runId}>
                          <button
                            type="button"
                            onClick={() => openRun(runId)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                          >
                            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">
                                {runTitle(run)}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {run.workspaceId !== ''
                                  ? `workspace ${run.workspaceId.slice(0, 8)}`
                                  : 'skill run'}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${meta.className}`}
                            >
                              {running ? 'running…' : meta.label}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs ${state.className}`}>{state.text}</span>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">:{port ?? '—'}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
