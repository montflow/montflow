import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { NewPresetDialog } from '@/components/NewPresetDialog'
import { useBuiltinReviewers, usePresets } from '@/lib/usePresets'
import { presetUrl, profileUrl } from '@/components/LandingPage'
import { navigate, setSearchParams, useSearchParams } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { PresetSummary } from '@/protocol'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleAlert,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'

interface PresetsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

/** How many preset rows to reveal at a time. */
const PAGE_SIZE = 16

/** Human label for a builtin reviewer id (from the catalog API). */
const builtinLabel = (id: string, map: Map<string, string>): string =>
  map.get(id) ?? id

const makeColumns = (
  workspaceId: string,
  builtinById: Map<string, string>,
): ColumnDef<PresetSummary>[] => [
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
    accessorKey: 'reviewers',
    header: 'Reviewers',
    enableSorting: false,
    cell: ({ row }) => {
      const reviewers = row.original.config?.reviewers ?? []
      if (reviewers.length === 0) return <span className="text-muted-foreground/50">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {reviewers.map((ref, index) => {
            if (ref.type === 'builtin') {
              return (
                <span
                  key={index}
                  className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                  title={`Builtin reviewer: ${ref.id ?? 'unknown'}`}
                >
                  {builtinLabel(ref.id ?? '?', builtinById)}
                </span>
              )
            }
            return (
              <button
                key={index}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (ref.name !== undefined) {
                    navigate(profileUrl(workspaceId, ref.name) + location.search)
                  }
                }}
                className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground underline-offset-4 transition-colors hover:border-primary/40 hover:text-foreground hover:underline"
                title={`Profile reviewer: ${ref.name ?? 'unknown'}`}
              >
                {ref.name ?? '?'}
              </button>
            )
          })}
        </div>
      )
    },
  },
  {
    accessorKey: 'supervisor',
    header: 'Supervisor',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.config?.supervisor.model === undefined ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span
          className="block truncate font-mono text-xs text-muted-foreground"
          title={row.original.config.supervisor.model}
        >
          {row.original.config.supervisor.model}
        </span>
      ),
  },
  {
    accessorKey: 'fixerModel',
    header: 'Fixer',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.config?.fixerModel === undefined ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span
          className="block truncate font-mono text-xs text-muted-foreground"
          title={row.original.config.fixerModel}
        >
          {row.original.config.fixerModel}
        </span>
      ),
  },
  {
    accessorKey: 'loops',
    header: 'Loops',
    enableSorting: false,
    cell: ({ row }) => {
      const config = row.original.config
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

export function PresetsSection({ workspaceId, conn, folder }: PresetsSectionProps) {
  const { data: presets, isPending, isFetching, isError, error, refetch } = usePresets(workspaceId, conn)
  const { data: builtins } = useBuiltinReviewers(conn)
  const builtinById = useMemo(
    () => new Map((builtins ?? []).map((b) => [b.id, b.label])),
    [builtins],
  )
  const [newOpen, setNewOpen] = useState(false)

  // Filters live in the URL (?rq=…) so they survive navigation. The query
  // key is presets-specific — SkillsSection owns `q` and ProfilesSection `pq`.
  const params = useSearchParams()
  const query = params.get('rq') ?? ''
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])

  const setQuery = (value: string): void => {
    const next = new URLSearchParams(params)
    if (value.trim() === '') next.delete('rq')
    else next.set('rq', value)
    setSearchParams(next)
  }

  const fuse = useMemo(
    () =>
      new Fuse(presets ?? [], {
        keys: [
          'name',
          'config.reviewers.id',
          'config.reviewers.name',
          'config.supervisor.model',
          'config.fixerModel',
        ],
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
    columns: makeColumns(workspaceId, builtinById),
    state: { sorting },
    onSortingChange: setSorting,
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

  const hasPresets = (presets?.length ?? 0) > 0

  return (
    <CollapsibleSection title="Presets" icon={<SlidersHorizontal className="size-5" />}>
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
      ) : !hasPresets ? (
        <p className="text-xs text-muted-foreground">
          No presets in{' '}
          <code className="rounded bg-muted px-1">.agents/@montflow/review-presets/</code> — create
          one with <code className="rounded bg-muted px-1">/montflow preset</code>.
        </p>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <SearchX className="size-4" />
                No presets match your filters.
              </div>
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
                              ? 'w-[24%]'
                              : header.column.id === 'reviewers'
                                ? 'w-[28%]'
                                : header.column.id === 'supervisor' || header.column.id === 'fixerModel'
                                  ? 'w-[16%]'
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
                    const target = presetUrl(workspaceId, row.original.name) + location.search
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
        folder={folder}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(name) => navigate(presetUrl(workspaceId, name) + location.search)}
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
