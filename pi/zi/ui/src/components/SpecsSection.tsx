import { useEffect, useMemo, useState } from 'react'
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
import { NewSpecDialog } from '@/components/NewSpecDialog'
import { TableEmptyState } from '@/components/TableEmptyState'
import { useSpecs } from '@/lib/useSpecs'
import { specUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { useWorkspacePrefs } from '@/lib/useWorkspacePrefs'
import { titleFromSlug } from '@/lib/utils'
import type { SpecSummary } from '@/protocol'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpenCheck,
  CircleCheck,
  CircleDashed,
  CircleDotDashed,
  Plus,
  Search,
  SearchX,
  X,
} from 'lucide-react'

interface SpecsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  /** Deep link (?section=specs) — force the panel open when navigating here. */
  reveal?: boolean
}

/** Status badge — draft (muted), planning/pending (violet/sky), active (blue), blocked (amber), complete (green). */
const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'planning') {
    return (
      <Badge
        variant="outline"
        className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300"
        title="Kickoff agent scaffolding phases"
      >
        <CircleDotDashed className="size-3 animate-pulse" />
        planning
      </Badge>
    )
  }
  if (status === 'pending') {
    return (
      <Badge
        variant="outline"
        className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
        title="Plan ready — not executing yet"
      >
        <CircleDashed className="size-3" />
        pending
      </Badge>
    )
  }
  if (status === 'blocked') {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        title="Blocked — needs a decision"
      >
        <CircleDashed className="size-3" />
        blocked
      </Badge>
    )
  }
  if (status === 'active') {
    return (
      <Badge
        variant="outline"
        className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
        title="Spec is being executed"
      >
        <CircleDotDashed className="size-3" />
        active
      </Badge>
    )
  }
  if (status === 'complete') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        title="All phases done"
      >
        <CircleCheck className="size-3" />
        complete
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" title="Draft — not started yet">
      <CircleDashed className="size-3" />
      draft
    </Badge>
  )
}

const makeColumns = (): ColumnDef<SpecSummary>[] => [
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
      <span
        className="block truncate font-medium underline-offset-4 group-hover:underline"
        title={row.original.name}
      >
        {titleFromSlug(row.original.name)}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'phaseCount',
    header: 'Phases',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.phaseCount === 0 ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{row.original.phaseCount}</span>
      ),
  },
  {
    accessorKey: 'taskCount',
    header: 'Tasks',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.taskCount === 0 ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{row.original.taskCount}</span>
      ),
  },
  {
    accessorKey: 'model',
    header: 'Bookkeeper',
    enableSorting: false,
    cell: ({ row }) => {
      const model = row.original.model
      return model === '' ? (
        <span className="text-[11px] text-muted-foreground/50" title="No bookkeeping model picked yet — agentic actions are disabled">
          not set
        </span>
      ) : (
        <span className="block max-w-48 truncate font-mono text-xs text-muted-foreground" title={model}>
          {model}
        </span>
      )
    },
  },
]

export function SpecsSection({ workspaceId, conn, id, reveal }: SpecsSectionProps) {
  const { data: specs, isPending, isFetching, isError, error, refetch } = useSpecs(workspaceId, conn)
  const [newOpen, setNewOpen] = useState(false)

  // Panel state (open/closed, search text, sort) is persisted per workspace
  // in localStorage and restored on mount.
  const [prefs, setPrefs] = useWorkspacePrefs(workspaceId, 'specs')
  const query = prefs.query
  const sorting = prefs.sort

  const setQuery = (value: string): void => setPrefs({ query: value })

  const fuse = useMemo(
    () =>
      new Fuse(specs ?? [], {
        keys: ['name', 'status'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [specs],
  )

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === '') return specs ?? []
    return fuse.search(trimmed).map((result) => result.item)
  }, [specs, fuse, query])

  const table = useReactTable({
    data: filtered,
    columns: makeColumns(),
    state: { sorting },
    onSortingChange: (updater) =>
      setPrefs({ sort: typeof updater === 'function' ? updater(sorting) : updater }),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Deep-link reveal: a breadcrumb section link (?section=specs) opens a
  // collapsed panel so the scroll lands on visible content.
  useEffect(() => {
    if (reveal === true) setPrefs({ open: true })
  }, [reveal, setPrefs])

  const hasSpecs = (specs?.length ?? 0) > 0

  return (
    <CollapsibleSection
      id={id}
      title="Specs"
      icon={<BookOpenCheck className="size-5" />}
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
        <SpecsTableSkeleton />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${specs?.length ?? 0} specs…`}
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
                Refreshing specs…
              </>
            )}
          </p>

          {/* Fixed-height table area so typing never shifts layout. */}
          <div className="relative h-96 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              hasSpecs ? (
                <TableEmptyState
                  icon={<SearchX className="size-4" />}
                  message="No specs match your filters."
                />
              ) : (
                <TableEmptyState
                  icon={<BookOpenCheck className="size-4" />}
                  message="No specs yet"
                  hint="Create one to plan a feature as phases and tasks under .agents/@montflow/specs/."
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
                              ? 'w-[34%]'
                              : header.column.id === 'status'
                                ? 'w-[16%]'
                                : header.column.id === 'model'
                                  ? 'w-[26%]'
                                  : 'w-[12%]'
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
                  {table.getRowModel().rows.map((row) => {
                    const target = specUrl(workspaceId, row.original.name)
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
        </>
      )}

      <NewSpecDialog
        workspaceId={workspaceId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(name) => navigate(specUrl(workspaceId, name))}
      />
    </CollapsibleSection>
  )
}

function SpecsTableSkeleton() {
  return (
    <div className="h-96 overflow-hidden rounded-md border">
      <div className="flex items-center border-b px-3 py-2">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-2.5 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
