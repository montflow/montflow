import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { NewPresetDialog } from '@/components/NewPresetDialog'
import { TableEmptyState } from '@/components/TableEmptyState'
import { usePresets } from '@/lib/usePresets'
import { presetStatus } from '@/lib/presetStatus'
import { presetUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { useWorkspacePrefs } from '@/lib/useWorkspacePrefs'
import { titleFromSlug } from '@/lib/utils'
import type { PresetConfig, PresetLoopConfig, PresetSummary } from '@/protocol'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'

interface PresetsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  /** Deep link (?section=presets) — force the panel open when navigating here. */
  reveal?: boolean
}

/** How many preset rows to reveal at a time. */
const PAGE_SIZE = 16

/** Narrows a preset config to the loop shape (pipeline configs → undefined, cells render —). */
const loopConfigOf = (config: PresetConfig | undefined): PresetLoopConfig | undefined =>
  config !== undefined && 'maxLoops' in config ? config : undefined

/** Number of steps in a config (0 when the config is missing/invalid). */
const stepCount = (config: PresetConfig | undefined): number =>
  config !== undefined && 'steps' in config && Array.isArray(config.steps) ? config.steps.length : 0

/** Total reviewer references across all steps (single reviewer = 1, group = roster size). */
const reviewerCount = (config: PresetConfig | undefined): number => {
  if (config === undefined || !('steps' in config) || !Array.isArray(config.steps)) return 0
  let count = 0
  for (const step of config.steps) {
    if (typeof step !== 'object' || step === null) continue
    if (step.kind === 'reviewer' && step.reviewer !== undefined) count += 1
    if (step.kind === 'reviewer-group') count += (step.reviewers ?? []).length
  }
  return count
}

const makeColumns = (): ColumnDef<PresetSummary>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-1 hover:text-foreground"
      >
        Name
        {column.getIsSorted() === 'asc' ? (
          <ArrowUp className="size-3" />
        ) : column.getIsSorted() === 'desc' ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-50" />
        )}
      </button>
    ),
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        <span
          className="block truncate font-medium underline-offset-4 group-hover:underline"
          title={row.original.name}
        >
          {titleFromSlug(row.original.name)}
        </span>
        {row.original.error !== undefined && (
          <span
            title={row.original.error}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500"
          >
            <CircleAlert className="size-3" />
            invalid
          </span>
        )}
      </span>
    ),
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="flex items-center gap-1 hover:text-foreground"
      >
        Type
        {column.getIsSorted() === 'asc' ? (
          <ArrowUp className="size-3" />
        ) : column.getIsSorted() === 'desc' ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-50" />
        )}
      </button>
    ),
    cell: ({ row }) => {
      const type = row.original.type ?? 'loop'
      return type === 'pipeline' ? (
        <Badge
          variant="outline"
          className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
          title="Pipeline preset — open-ended step pipeline (not yet executable)"
        >
          pipeline
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          title="Review loop preset — reviewer groups, aggregation, fixers, human interruptor"
        >
          loop
        </Badge>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => {
      const { status, issues } = presetStatus(row.original.config)
      return status === 'valid' ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
          title="All required fields are set — ready to run"
        >
          <CircleCheck className="size-3" />
          valid
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
          title={issues.join('\n')}
        >
          <CircleX className="size-3" />
          invalid
        </span>
      )
    },
  },
  {
    accessorKey: 'steps',
    header: 'Steps',
    enableSorting: false,
    cell: ({ row }) => {
      const count = stepCount(row.original.config)
      return count === 0 ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      )
    },
  },
  {
    accessorKey: 'reviewers',
    header: 'Reviewers',
    enableSorting: false,
    cell: ({ row }) => {
      const count = reviewerCount(row.original.config)
      return count === 0 ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      )
    },
  },
  {
    accessorKey: 'loops',
    header: 'Loops',
    enableSorting: false,
    cell: ({ row }) => {
      const config = loopConfigOf(row.original.config)
      if (config === undefined) return <span className="text-muted-foreground/50">—</span>
      const cycles = config.maxCycles ?? config.maxLoops
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {config.maxLoops}
          <span className="mx-0.5 text-muted-foreground/50">×</span>
          {cycles}
        </span>
      )
    },
  },
]

export function PresetsSection({ workspaceId, conn, id, reveal }: PresetsSectionProps) {
  const { data: presets, isPending, isFetching, isError, error, refetch } = usePresets(workspaceId, conn)
  const [newOpen, setNewOpen] = useState(false)

  // Panel state (open/closed, search text, sort) is persisted per workspace
  // in localStorage and restored on mount.
  const [prefs, setPrefs] = useWorkspacePrefs(workspaceId, 'presets')
  const query = prefs.query
  const sorting = prefs.sort

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const setQuery = (value: string): void => setPrefs({ query: value })

  const fuse = useMemo(
    () =>
      new Fuse(presets ?? [], {
        keys: ['name', 'type', 'config.steps.kind'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [presets],
  )

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === '') return presets ?? []
    return fuse.search(trimmed).map((result) => result.item)
  }, [presets, fuse, query])

  const table = useReactTable({
    data: filtered,
    columns: makeColumns(),
    state: { sorting },
    onSortingChange: (updater) =>
      setPrefs({ sort: typeof updater === 'function' ? updater(sorting) : updater }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Start back at the first page whenever the result set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, presets])

  const loadMore = (): void => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
    // After React appends the new rows, jump the table scroll to the bottom
    // so the newly revealed batch is visible immediately.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = tableScrollRef.current
        if (el !== null) el.scrollTop = el.scrollHeight
      })
    })
  }

  // Deep-link reveal: a breadcrumb section link (?section=presets) opens a
  // collapsed panel so the scroll lands on visible content.
  useEffect(() => {
    if (reveal === true) setPrefs({ open: true })
  }, [reveal, setPrefs])

  const hasPresets = (presets?.length ?? 0) > 0

  return (
    <CollapsibleSection
      id={id}
      title="Presets"
      icon={<SlidersHorizontal className="size-5" />}
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
        <PresetsTableSkeleton />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${presets?.length ?? 0} presets…`}
                className="pl-8 pr-8"
              />
              {query !== '' && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  title="Clear search"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>

          {/* Always-rendered status slot so background refetches don't push
              the table down while typing. */}
          <p className="mb-2 text-[11px] text-muted-foreground">
            {isFetching && (
              <>
                <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-primary/60 align-middle" />
                Refreshing presets…
              </>
            )}
          </p>

          <p className="mb-2 text-[11px] text-muted-foreground">
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} presets
          </p>

          {/* Fixed height in every state — even when the filter matches zero
              rows — so typing never changes the layout. */}
          <div ref={tableScrollRef} className="relative h-96 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              hasPresets ? (
                <TableEmptyState
                  icon={<SearchX className="size-4" />}
                  message="No presets match your filters."
                />
              ) : (
                <TableEmptyState
                  icon={<SlidersHorizontal className="size-4" />}
                  message="No presets yet"
                  hint="Create one in .agents/@montflow/review-presets/ or run /montflow preset."
                />
              )
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className={`px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${
                            header.column.id === 'name'
                              ? 'w-[22%]'
                              : header.column.id === 'type'
                                ? 'w-[12%]'
                                : 'w-[8%]'
                          }`}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.slice(0, visibleCount).map((row) => {
                    const target = presetUrl(workspaceId, row.original.name)
                    return (
                      <tr
                        key={row.id}
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
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-3 py-2 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {/* Fixed-height footer slot so the "Show more" button's
              appearance doesn't shift everything below it. */}
          <div className="mt-3 flex h-8 justify-center">
            {filtered.length > visibleCount && (
              <Button variant="outline" size="sm" onClick={loadMore}>
                Show more ({filtered.length - visibleCount} more)
              </Button>
            )}
          </div>
        </>
      )}

      <NewPresetDialog
        workspaceId={workspaceId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(name) => navigate(presetUrl(workspaceId, name))}
      />
    </CollapsibleSection>
  )
}

function PresetsTableSkeleton() {
  return (
    <div className="h-96 overflow-hidden rounded-md border">
      <div className="flex items-center border-b px-3 py-2">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-2.5 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}
