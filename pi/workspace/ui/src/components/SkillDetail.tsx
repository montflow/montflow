import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSkillDetail, useSkillNameToIdMap } from '@/lib/useSkills'
import { skillUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { SkillDetail as SkillDetailType } from '@/protocol'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

interface SkillDetailProps {
  workspaceId: string
  skillId: string
  conn: 'connecting' | 'open' | 'closed'
}

export function SkillDetail({ workspaceId, skillId, conn }: SkillDetailProps) {
  const queryClient = useQueryClient()
  const { data: skill, isPending, isError, error, refetch } = useSkillDetail(
    workspaceId,
    skillId,
    conn,
  )
  // Dependencies are referenced by frontmatter name (or directory slug) —
  // resolve each to its directory slug so the badge can link to that
  // skill's detail page. Unresolvable names stay plain badges.
  const nameToId = useSkillNameToIdMap(workspaceId, conn)
  const deps = (skill?.dependencies ?? []).map((dep) => {
    const slug = nameToId.get(dep)
    return {
      name: dep,
      target: slug === undefined ? null : skillUrl(workspaceId, slug) + location.search,
    }
  })
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Filters are in the query string (see SkillsSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

  const openEdit = (): void => {
    setDraft(skill?.markdown ?? '')
    setActionError(null)
    setEditOpen(true)
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/skills/${encodeURIComponent(skillId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: draft }),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await queryClient.invalidateQueries({ queryKey: ['skills', workspaceId] })
      setEditOpen(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/skills/${encodeURIComponent(skillId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await queryClient.invalidateQueries({ queryKey: ['skills', workspaceId] })
      back()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={back}
      >
        <ArrowLeft className="size-4" />
        Back to workspace
      </Button>

      {isError && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
          <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
          <Button size="xs" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isPending ? (
        <div className="mt-6 animate-pulse space-y-3">
          <div className="h-6 w-1/2 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
          <div className="h-40 w-full rounded bg-muted" />
        </div>
      ) : skill !== undefined ? (
        <>
          <SkillHeader skill={skill} deps={deps} onModify={openEdit} onDelete={() => setDeleteOpen(true)} />
          <div className="prose dark:prose-invert mt-6 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.markdown}</ReactMarkdown>
          </div>
        </>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {titleFromSlug(skill?.name ?? skillId)}</DialogTitle>
            <DialogDescription>
              Edits the raw <code className="rounded bg-muted px-1">SKILL.md</code> — frontmatter
              included.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="min-h-80 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {actionError !== null && <p className="text-xs text-red-500">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete skill?</DialogTitle>
            <DialogDescription>
              This permanently removes{' '}
              <code className="rounded bg-muted px-1">.agents/skills/{skillId}/</code> from the
              workspace. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {actionError !== null && <p className="text-xs text-red-500">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function SkillHeader({
  skill,
  deps,
  onModify,
  onDelete,
}: {
  skill: SkillDetailType
  /** Dependencies with their detail-page target (null = not in this workspace). */
  deps: Array<{ name: string; target: string | null }>
  onModify: () => void
  onDelete: () => void
}) {
  return (
    <div className="mt-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{titleFromSlug(skill.name)}</h1>
        {skill.description !== '' && (
          <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
        )}
        {(skill.groups.length > 0 || skill.dependencies.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {skill.groups.map((group) => (
              <Badge key={group} variant="secondary">
                {group}
              </Badge>
            ))}
            {deps.map((dep) => {
              const target = dep.target
              return target !== null ? (
                <Badge asChild key={dep.name} variant="link" title="Dependency — view skill">
                  <a
                    href={target}
                    onClick={(event) => {
                      event.preventDefault()
                      navigate(target)
                    }}
                  >
                    {dep.name}
                  </a>
                </Badge>
              ) : (
                <Badge key={dep.name} variant="outline" title="Dependency (not in this workspace)">
                  {dep.name}
                </Badge>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onModify}>
          <Pencil className="size-3.5" />
          Modify
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}
