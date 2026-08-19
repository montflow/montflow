import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { TableEmptyState } from '@/components/TableEmptyState'
import { NewPromptDialog } from '@/components/NewPromptDialog'
import { usePrompts } from '@/lib/usePrompts'
import { useWorkspacePrefs } from '@/lib/useWorkspacePrefs'
import { promptUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import { promptPlaceholders } from '@/lib/prompt'
import type { PromptSummary } from '@/protocol'
import { CircleAlert, Plus, Sparkles } from 'lucide-react'

interface PromptsSectionProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  /** Deep link (?section=prompts) — force the panel open when navigating here. */
  reveal?: boolean
}

/** How many prompt rows to reveal at a time. */
const PAGE_SIZE = 16

/** Number of template placeholders (0 when the prompt is missing/invalid). */
const placeholderCount = (prompt: PromptSummary): number =>
  prompt.template === undefined ? 0 : promptPlaceholders(prompt.template).length

export function PromptsSection({ workspaceId, conn, id, reveal }: PromptsSectionProps) {
  const [prefs, setPrefs] = useWorkspacePrefs(workspaceId, 'prompts')
  const [newOpen, setNewOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Deep-link reveal: a breadcrumb section link (?section=prompts) opens a
  // collapsed panel so the scroll lands on visible content.
  useEffect(() => {
    if (reveal === true) setPrefs({ open: true })
  }, [reveal, setPrefs])

  const { data: prompts, isPending, isError, error, refetch } = usePrompts(workspaceId, conn)

  const list = useMemo(() => prompts ?? [], [prompts])
  const visible = useMemo(() => list.slice(0, visibleCount), [list, visibleCount])

  const hasPrompts = list.length > 0
  const invalidCount = useMemo(() => list.filter((p) => p.error !== undefined).length, [list])

  return (
    <CollapsibleSection
      id={id}
      title="Prompts"
      icon={<Sparkles className="size-5" />}
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
        <PromptsTableSkeleton />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {list.length} prompt{list.length === 1 ? '' : 's'}
              {invalidCount > 0 && <span className="text-amber-500"> · {invalidCount} invalid</span>}
            </p>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>

          {/* Fixed height in every state — even with zero rows — so panel
              open/close never jumps. */}
          <div className="relative h-96 overflow-y-auto rounded-md border">
            {visible.length === 0 ? (
              hasPrompts ? null : (
                <TableEmptyState
                  icon={<Sparkles className="size-4" />}
                  message="No prompts yet"
                  hint="Save reusable prompts with {{variable}} placeholders, then run them to collect the values."
                />
              )
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b">
                    <th className="w-[40%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Prompt
                    </th>
                    <th className="w-[15%] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Variables
                    </th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((prompt) => {
                    const target = promptUrl(workspaceId, prompt.name)
                    return (
                      <tr
                        key={prompt.name}
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
                        <td className="px-3 py-2 align-middle">
                          <p className="flex items-center gap-1.5 truncate text-[13px] font-medium underline-offset-4 group-hover:underline">
                            {titleFromSlug(prompt.name)}
                            {prompt.error !== undefined && (
                              <CircleAlert
                                className="size-3.5 shrink-0 text-amber-500"
                                aria-label={`Invalid prompt file`}
                              />
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-2 align-middle font-mono text-[11px] text-muted-foreground">
                          {prompt.error === undefined
                            ? placeholderCount(prompt) || '—'
                            : '—'}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                          <p className="truncate">
                            {prompt.error !== undefined
                              ? 'invalid file'
                              : prompt.description !== undefined && prompt.description !== ''
                                ? prompt.description
                                : '—'}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 flex h-8 justify-center">
            {list.length > visibleCount && (
              <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                Show more ({list.length - visibleCount} more)
              </Button>
            )}
          </div>
        </>
      )}

      <NewPromptDialog
        workspaceId={workspaceId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(name) => navigate(promptUrl(workspaceId, name))}
      />
    </CollapsibleSection>
  )
}

function PromptsTableSkeleton() {
  return (
    <div className="h-96 overflow-hidden rounded-md border">
      <div className="flex items-center border-b px-3 py-2">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-10 animate-pulse rounded bg-muted" />
          <div className="h-2.5 flex-1 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
