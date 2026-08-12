import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { useBuiltinReviewers } from '@/lib/usePresets'
import { useProfiles } from '@/lib/useProfiles'
import { useClampedPopover } from '@/lib/useClampedPopover'
import type { PresetReviewerRef } from '@/protocol'
import { Check, ChevronDown, Loader2, Plus, Search, UserRound, Users, X } from 'lucide-react'

interface ReviewerPickerProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Current selection; undefined = unconfigured (invalid). */
  value: PresetReviewerRef | undefined
  onChange: (ref: PresetReviewerRef) => void
  /** 'inline' renders a full-width trigger (reviewer steps); 'icon' is a bare + button (group add). */
  variant?: 'inline' | 'icon'
  /** Icon-variant only: the + button's aria label / title. */
  title?: string
}

/** One pickable entry — a builtin reviewer or a profile, both as a ref. */
interface ReviewerOption {
  ref: PresetReviewerRef
  label: string
  description: string
}

/** Estimated panel height — drives the open-upward decision in dialogs. */
const PANEL_HEIGHT = 380
/** Panel width for the icon (+ button) variant — inline spans the row. */
const ICON_PANEL_WIDTH = 240

/**
 * Searchable reviewer picklist (builtin reviewers + workspace profiles) for
 * workflow steps — same popover UX as ModelSelect. A reviewer step is
 * invalid until something is picked here.
 */
export function ReviewerPicker({
  workspaceId,
  conn,
  value,
  onChange,
  variant = 'inline',
  title,
}: ReviewerPickerProps) {
  const builtinsQuery = useBuiltinReviewers(conn)
  const profilesQuery = useProfiles(workspaceId, conn)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const width = variant === 'icon' ? ICON_PANEL_WIDTH : 0
  const { triggerRef, panelLeft, openUp } = useClampedPopover(open, width, PANEL_HEIGHT)

  const options = useMemo<ReviewerOption[]>(
    () => [
      // Only the generic builtin reviewer is offered — everything else goes
      // through profiles.
      ...(builtinsQuery.data ?? [])
        .filter((builtin) => builtin.id === 'generic')
        .map((builtin) => ({
          ref: { type: 'builtin' as const, id: builtin.id },
          label: builtin.label,
          description: `Builtin reviewer · ${builtin.id}`,
        })),
      ...(profilesQuery.data ?? []).map((profile) => ({
        ref: { type: 'profile' as const, name: profile.name },
        label: profile.name,
        description: profile.description,
      })),
    ],
    [builtinsQuery.data, profilesQuery.data],
  )

  // Fuzzy search over label + ref ids/names.
  const fuse = useMemo(
    () =>
      new Fuse(options, {
        keys: ['label', 'ref.id', 'ref.name'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [options],
  )

  const matches = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === '') return options
    return fuse.search(trimmed).map((result) => result.item)
  }, [options, fuse, query])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const pick = (ref: PresetReviewerRef): void => {
    close()
    if (value !== undefined && ref.type === value.type && (ref.id ?? ref.name) === (value.id ?? value.name)) return
    onChange(ref)
  }

  const selectedLabel =
    value === undefined
      ? null
      : value.type === 'builtin'
        ? (options.find((o) => o.ref.type === 'builtin' && o.ref.id === value.id)?.label ?? value.id ?? '?')
        : value.name ?? '?'

  const loading = (builtinsQuery.isPending && builtinsQuery.isFetching) || (profilesQuery.isPending && profilesQuery.isFetching)
  const isSelected = (option: ReviewerOption): boolean =>
    value !== undefined &&
    option.ref.type === value.type &&
    (option.ref.id ?? option.ref.name) === (value.id ?? value.name)

  return (
    <div className="relative">
      {variant === 'inline' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          title="Choose the reviewer for this step"
          className={`flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            value === undefined
              ? 'border-rose-300/60 bg-rose-50/60 text-rose-400 dark:border-rose-400/30 dark:bg-rose-400/5 dark:text-rose-300 hover:text-rose-300'
              : 'border-input text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedLabel !== null ? (
              <>
                {selectedLabel}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {value?.type === 'profile' ? 'profile' : 'builtin'}
                </span>
              </>
            ) : (
              'Select reviewer…'
            )}
          </span>
          <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          title={title ?? 'Add a reviewer'}
          aria-label={title ?? 'Add a reviewer'}
          className="inline-flex size-5 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="size-3" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div
            role="listbox"
            style={{ left: panelLeft, width: width === 0 ? undefined : width }}
            className={`absolute z-40 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg ${
              width === 0 ? 'w-full' : ''
            } ${openUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          >
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
                    if (event.key === 'Enter' && matches.length === 1) pick(matches[0]!.ref)
                  }}
                  placeholder="Search reviewers & profiles…"
                  role="combobox"
                  aria-expanded={open}
                  aria-controls="reviewer-picker-list"
                  aria-autocomplete="list"
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>

            {loading ? (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading reviewers…
              </p>
            ) : options.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No reviewers or profiles — create a profile first.
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">No matches.</p>
            ) : (
              <ul id="reviewer-picker-list" className="max-h-72 overflow-y-auto py-1">
                {matches.map((option) => {
                  const selected = isSelected(option)
                  return (
                    <li key={`${option.ref.type}:${option.ref.id ?? option.ref.name}`}>
                      <button
                        type="button"
                        onClick={() => pick(option.ref)}
                        role="option"
                        aria-selected={selected}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded ${
                            option.ref.type === 'builtin'
                              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {option.ref.type === 'builtin' ? (
                            <Users className="size-3" />
                          ) : (
                            <UserRound className="size-3" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium">{option.label}</span>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                              {option.ref.type}
                            </span>
                          </span>
                          {option.description !== '' && (
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </span>
                        {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="flex w-full items-center gap-1.5 border-t px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
                Clear search
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
