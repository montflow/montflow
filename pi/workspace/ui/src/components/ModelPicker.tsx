import { useEffect, useMemo, useRef, useState } from 'react'
import { effectiveModelId, useModels, useSetModel } from '@/lib/useModels'
import { useClampedPopover } from '@/lib/useClampedPopover'
import { ChevronDown, Cpu, Loader2, Search, X } from 'lucide-react'
import Fuse from 'fuse.js'

interface ModelPickerProps {
  conn: 'connecting' | 'open' | 'closed'
}

/** Panel width must match the `w-80` class on the dropdown below. */
const PANEL_WIDTH = 320

/**
 * Header picker for the model used by agentic tasks (skill creation runs,
 * etc.). The selection is persisted router-side and broadcast to every tab
 * via the modelsChanged WebSocket event; this component only renders the
 * TanStack Query-backed state and sends PUT /api/models on change.
 */
export function ModelPicker({ conn }: ModelPickerProps) {
  const modelsQuery = useModels(conn)
  const setModel = useSetModel()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  // The picker sits near the header's left edge, so the panel must be
  // clamped inside the viewport instead of growing leftward off-screen.
  const { triggerRef, panelLeft } = useClampedPopover(open, PANEL_WIDTH)

  const models = modelsQuery.data?.models ?? []
  // `data` is stable across re-renders (react-query), so memo deps below use
  // `data?.models` rather than the `?? []` fallback above (which would change
  // identity while the models query is pending).
  const selected = modelsQuery.data?.selected ?? null
  // The model the button shows: the persisted selection, or — while following
  // each session's current model — the first session-current model.
  const effectiveId = effectiveModelId(models, selected, null)
  const selectedModel = models.find((model) => model.id === effectiveId) ?? null

  // Fuzzy search over the model id (with and without provider prefix) and the
  // display name, matching the search pattern used by the other sections.
  const fuse = useMemo(
    () =>
      new Fuse(modelsQuery.data?.models ?? [], {
        keys: ['id', 'modelId', 'name'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [modelsQuery.data?.models],
  )

  const matches = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === '') return modelsQuery.data?.models ?? []
    return fuse.search(trimmed).map((result) => result.item)
  }, [modelsQuery.data?.models, fuse, query])

  // Focus the search box whenever the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const pick = (id: string | null): void => {
    close()
    if (id === selected) return
    setModel.mutate(id)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Model used for agentic tasks (e.g. creating a skill)"
        className="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Cpu className="size-3.5 shrink-0" />
        <span className="max-w-40 truncate font-mono">
          {selectedModel !== null ? selectedModel.id : 'Model'}
        </span>
        {setModel.isPending && <Loader2 className="size-3 animate-spin" />}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div
            role="listbox"
            style={{ left: panelLeft }}
            className="absolute z-40 mt-1.5 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold">Agentic model</span>
              <span className="text-[10px] text-muted-foreground">
                used for skill runs & agentic tasks
              </span>
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
                    if (event.key === 'Escape') close()
                    if (event.key === 'Enter' && matches.length === 1) {
                      pick(matches[0]!.id)
                    }
                  }}
                  placeholder="Search models…"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="model-picker-list"
                  aria-autocomplete="list"
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>

            {modelsQuery.isPending && modelsQuery.isFetching ? (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading models…
              </p>
            ) : models.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No models available — start /montflow in a pi project session.
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No models match your search.
              </p>
            ) : (
              <ul id="model-picker-list" className="max-h-72 overflow-y-auto py-1">
                {matches.map((model) => {
                  const isSelected = model.id === effectiveId
                  return (
                    <li key={model.id}>
                      <button
                        type="button"
                        onClick={() => pick(model.id)}
                        role="option"
                        aria-selected={isSelected}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span
                          className={`size-2 shrink-0 rounded-full ${isSelected ? 'bg-primary' : 'bg-transparent ring-1 ring-border'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-mono text-xs">{model.id}</span>
                            {model.isCurrent && (
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                current
                              </span>
                            )}
                          </span>
                          {model.name !== model.id && (
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {model.name}
                            </span>
                          )}
                        </span>
                        {isSelected && <span className="text-[10px] font-semibold text-primary">✓</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {selected !== null && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="block w-full border-t px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Follow each session's current model
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
