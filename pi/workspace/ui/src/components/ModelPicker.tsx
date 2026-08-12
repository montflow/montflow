import { useState } from 'react'
import { useModels, useSetModel } from '@/lib/useModels'
import { ChevronDown, Cpu, Loader2 } from 'lucide-react'

interface ModelPickerProps {
  conn: 'connecting' | 'open' | 'closed'
}

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

  const models = modelsQuery.data?.models ?? []
  const selected = modelsQuery.data?.selected ?? null
  const selectedModel = models.find((model) => model.id === selected) ?? null

  const pick = (id: string | null): void => {
    setOpen(false)
    if (id === selected) return
    setModel.mutate(id)
  }

  return (
    <div className="relative">
      <button
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
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute right-0 z-40 mt-1.5 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-semibold">Agentic model</span>
              <span className="text-[10px] text-muted-foreground">
                used for skill runs & agentic tasks
              </span>
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
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {models.map((model) => {
                  const isSelected = model.id === selected
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
