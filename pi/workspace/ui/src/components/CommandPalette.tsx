import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PaletteCommand {
  id: string
  label: string
  run: () => void
}

interface CommandPaletteProps {
  /** Commands shown when the palette opens (labels are filtered as you type). */
  commands: PaletteCommand[]
}

/** kbd keycap styling used in the hint footer. */
const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px] text-foreground">
    {children}
  </kbd>
)

/** Modal command palette opened with ctrl/cmd+P. */
export function CommandPalette({ commands }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ctrl/cmd+P toggles the palette (preventDefault blocks the browser print dialog).
  // Capture phase so we beat any bubble-phase handlers and the browser's own
  // default action, which would otherwise open the print dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (trimmed === '') return commands
    return commands.filter((command) => command.label.toLowerCase().includes(trimmed))
  }, [commands, query])

  // Keep the selection inside the list when filtering shrinks it.
  useEffect(() => {
    setSelected((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Re-arm the palette each time it opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      // The input isn't mounted until the panel renders — focus on the next frame.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const close = (): void => setOpen(false)

  const runSelected = (index: number): void => {
    const command = filtered[index]
    if (command === undefined) return
    close()
    command.run()
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const count = filtered.length
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((prev) => (prev + 1) % Math.max(1, count))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((prev) => (prev - 1 + Math.max(1, count)) % Math.max(1, count))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runSelected(selected)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50"
    >
      {/* Click-outside to close. */}
      <div className="absolute inset-0 bg-black/50" onClick={close} />

      <div className="fixed left-1/2 top-[15%] z-10 w-full max-w-lg -translate-x-1/2">
        <div className="overflow-hidden rounded-lg border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelected(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Type a command…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Kbd>esc</Kbd>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No commands match.
              </p>
            ) : (
              <ul>
                {filtered.map((command, index) => (
                  <li key={command.id}>
                    <button
                      type="button"
                      onClick={() => runSelected(index)}
                      onMouseEnter={() => setSelected(index)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                        index === selected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground',
                      )}
                    >
                      <span className="truncate">{command.label}</span>
                      {index === selected && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3 border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate
            </span>
            <span>
              <Kbd>↵</Kbd> to select
            </span>
            <span className="ml-auto">
              <Kbd>esc</Kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
