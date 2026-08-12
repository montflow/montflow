import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '@/lib/useLocation'
import { runUrl } from '@/components/LandingPage'
import type { SkillRunState } from '@/lib/useUiSocket'
import { runTitle } from '@/lib/runTitle'
import { ModelPicker } from '@/components/ModelPicker'
import { ChevronDown, Search, Sparkles, X } from 'lucide-react'

interface HeaderProps {
  conn: 'connecting' | 'open' | 'closed'
  port: number | null
  /** Agentic skill runs (isolated agents) — the only thing this dropdown lists. */
  runs: Record<string, SkillRunState>
}

const connLabel: Record<HeaderProps['conn'], { text: string; className: string }> = {
  connecting: { text: 'connecting…', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  open: { text: 'connected', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  closed: { text: 'disconnected', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
}

export function Header({ conn, port, runs }: HeaderProps) {
  const state = connLabel[conn]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Focus the search box whenever the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Agentic runs — newest first (the map preserves insertion order), matched
  // against the search query (runs search their full transcript).
  const runsList = useMemo<Array<[string, SkillRunState]>>(() => {
    const list = Object.entries(runs).reverse()
    const q = query.trim().toLowerCase()
    if (q === '') return list
    return list.filter(([, run]) =>
      run.entries.some((entry) => entry.text.toLowerCase().includes(q)),
    )
  }, [runs, query])

  const openRun = (runId: string): void => {
    setOpen(false)
    setQuery('')
    navigate(runUrl(runId))
  }

  return (
    <header className="relative flex items-center gap-3 border-b px-4 py-2">
      <span className={`rounded-full px-2 py-0.5 text-xs ${state.className}`}>{state.text}</span>

      <div className="relative ml-auto flex items-center gap-3">
        <ModelPicker conn={conn} />

        <div className="relative">
          <button
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
                className="absolute right-0 z-40 mt-1.5 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
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
                </div>

                {runsList.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    {query === ''
                      ? 'No agentic runs yet — create a skill with "Ask an agent".'
                      : 'No runs match your search.'}
                  </p>
                ) : (
                  <ul className="max-h-96 overflow-y-auto py-1">
                    {runsList.map(([runId, run]) => {
                      const running = run.status === 'running'
                      const badge =
                        run.status === 'done'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : run.status === 'awaiting' || run.status === 'interrupted'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : run.status === 'error'
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
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
                              className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${badge}`}
                            >
                              {running
                                ? 'running…'
                                : run.status === 'awaiting'
                                  ? 'awaiting answer'
                                  : run.status}
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
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-mono">:{port ?? '—'}</span>
      </div>
    </header>
  )
}
