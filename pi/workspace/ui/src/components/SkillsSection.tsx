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
import { NewSkillDialog } from '@/components/NewSkillDialog'
import { skillUrl } from '@/components/LandingPage'
import { useSkills } from '@/lib/useSkills'
import { navigate, setSearchParams, useSearchParams } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { SkillSummary } from '@/protocol'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, SearchX, Sparkles, X } from 'lucide-react'

interface SkillsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

/** How many skill rows to reveal at a time. */
const PAGE_SIZE = 16

const columns: ColumnDef<SkillSummary>[] = [
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
    accessorKey: 'description',
    header: 'Description',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.description === '' ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <span
          className="line-clamp-2 text-xs text-muted-foreground"
          title={row.original.description}
        >
          {row.original.description}
        </span>
      ),
  },
  {
    accessorKey: 'groups',
    header: 'Groups',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.groups.length === 0 ? (
        <span className="text-muted-foreground/50">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {row.original.groups.map((group) => (
            <span
              key={group}
              className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {group}
            </span>
          ))}
        </div>
      ),
  },
]

export function SkillsSection({ workspaceId, conn, folder }: SkillsSectionProps) {
  const { data: skills, isPending, isFetching, isError, error, refetch } = useSkills(workspaceId, conn)
  const [newOpen, setNewOpen] = useState(false)

  // Filters live in the URL (?q=…&g=a,b) so they survive navigation.
  const params = useSearchParams()
  const query = params.get('q') ?? ''
  const selectedGroups = useMemo(
    () =>
      (params.get('g') ?? '')
        .split(',')
        .map((group) => group.trim())
        .filter((group) => group !== ''),
    [params],
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const setQuery = (value: string): void => {
    const next = new URLSearchParams(params)
    if (value.trim() === '') next.delete('q')
    else next.set('q', value)
    setSearchParams(next)
  }

  const groups = useMemo(() => {
    const set = new Set<string>()
    for (const skill of skills ?? []) for (const group of skill.groups) set.add(group)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [skills])

  // Apply the group filter first, then run fuzzy search over that subset so
  // the two filters compose (search never surfaces out-of-group skills).
  const groupFiltered = useMemo(() => {
    if (selectedGroups.length === 0) return skills ?? []
    return (skills ?? []).filter((skill) =>
      skill.groups.some((group) => selectedGroups.includes(group)),
    )
  }, [skills, selectedGroups])

  const fuse = useMemo(
    () =>
      new Fuse(groupFiltered, {
        keys: ['name'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [groupFiltered],
  )

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed === '') return groupFiltered
    return fuse.search(trimmed).map((result) => result.item)
  }, [groupFiltered, fuse, query])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Start back at the first page whenever the result set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, selectedGroups, skills])

  const toggleGroup = (group: string): void => {
    const next = new URLSearchParams(params)
    const current = (next.get('g') ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g !== '')
    const updated = current.includes(group)
      ? current.filter((g) => g !== group)
      : [...current, group]
    if (updated.length === 0) next.delete('g')
    else next.set('g', updated.join(','))
    setSearchParams(next)
  }

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

  const hasSkills = (skills?.length ?? 0) > 0

  return (
    <CollapsibleSection title="Skills" icon={<Sparkles className="size-5" />}>
      {isError && (
        <div className="mb-2 flex items-center gap-2 text-xs text-red-500">
          <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isPending ? (
        <SkillsTableSkeleton />
      ) : !hasSkills ? (
        <p className="text-xs text-muted-foreground">
          No skills in <code className="rounded bg-muted px-1">.agents/skills/</code> yet.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${skills?.length ?? 0} skills…`}
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

          {groups.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const active = selectedGroups.includes(group)
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => toggleGroup(group)}
                    aria-pressed={active}
                    className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    {group}
                  </button>
                )
              })}
            </div>
          )}

          {/* Always-rendered status slot so background refetches don't push
              the table down while typing. */}
          <p className="mb-2 text-[11px] text-muted-foreground">
            {isFetching && (
              <>
                <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-primary/60 align-middle" />
                Refreshing skills…
              </>
            )}
          </p>

          <p className="mb-2 text-[11px] text-muted-foreground">
            Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} skills
          </p>

          {/* Fixed height in every state — even when the filter matches zero
              rows — so typing never changes the layout. */}
          <div ref={tableScrollRef} className="relative h-96 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <SearchX className="size-4" />
                No skills match your filters.
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
                              ? 'w-[30%]'
                              : header.column.id === 'groups'
                                ? 'w-[26%]'
                                : ''
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
                    // Older routers don't send `id` yet — fall back to the name.
                    const slug = row.original.id !== '' ? row.original.id : row.original.name
                    // Keep the current filters in the URL so the back button
                    // from the skill detail restores them.
                    const target = skillUrl(workspaceId, slug) + location.search
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                  >
                    Show more ({filtered.length - visibleCount} more)
                  </Button>
                )}
              </div>
        </>
      )}

      <NewSkillDialog
        workspaceId={workspaceId}
        folder={folder}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(skill) => navigate(skillUrl(workspaceId, skill.id))}
      />
    </CollapsibleSection>
  )
}

function SkillsTableSkeleton() {
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
