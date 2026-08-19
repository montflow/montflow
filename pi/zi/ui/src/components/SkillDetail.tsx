import { useEffect, useState } from 'react'
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
import { ModelSelect } from '@/components/ModelSelect'
import { AiInput } from '@/components/AiInput'
import { useSkillDetail, useSkillNameToIdMap, useSkills } from '@/lib/useSkills'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { runUrl, skillUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { SkillDetail as SkillDetailType } from '@/protocol'
import { ArrowLeft, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react'

interface SkillDetailProps {
  workspaceId: string
  skillId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

export function SkillDetail({ workspaceId, skillId, conn, folder }: SkillDetailProps) {
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
  const [modifyOpen, setModifyOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Filters are in the query string (see SkillsSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

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
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
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
          <SkillHeader
            skill={skill}
            deps={deps}
            onModify={() => setModifyOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <div className="prose dark:prose-invert mt-6 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.markdown}</ReactMarkdown>
          </div>
        </>
      ) : null}

      <ModifySkillDialog
        workspaceId={workspaceId}
        skillId={skillId}
        skill={skill}
        folder={folder}
        conn={conn}
        open={modifyOpen}
        onOpenChange={setModifyOpen}
      />

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

type ModifyMode = 'choose' | 'manual' | 'agentic'

/**
 * Modify an existing skill — manually (raw SKILL.md editor) or agentically
 * (isolated agent run that edits the file in place, streamed to the run
 * page). Mirrors the new-skill dialog's manual/agentic split.
 */
function ModifySkillDialog({
  workspaceId,
  skillId,
  skill,
  folder,
  conn,
  open,
  onOpenChange,
}: {
  workspaceId: string
  skillId: string
  skill: SkillDetailType | undefined
  folder: string | null
  conn: 'connecting' | 'open' | 'closed'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { sendCommand } = useUiSocket()
  // Model override for this run: preselect the header picker's current
  // choice so the user can switch to a different model (null = default).
  const modelsQuery = useModels(conn)
  // The "include authoring skill" toggle only appears when the workspace
  // actually has the authoring-skills skill (the backend loads it by name).
  const skillsQuery = useSkills(workspaceId, conn)
  const hasAuthoringSkill = (skillsQuery.data ?? []).some(
    (s) => s.id === 'authoring-skills' || s.name === 'authoring-skills',
  )

  const [mode, setMode] = useState<ModifyMode>('choose')

  // Manual mode
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)

  // Agentic mode
  const [prompt, setPrompt] = useState('')
  const [includeAuthoring, setIncludeAuthoring] = useState(true)
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  // Re-arm the dialog each time it opens: seed the manual editor with the
  // current SKILL.md. The agentic prompt starts empty — the skill summary
  // (describeSkill) pre-fills the AiInput modal instead, so the AI button is
  // usable and can draft the change request for the run.
  const start = (): void => {
    setMode('choose')
    setDraft(skill?.markdown ?? '')
    setManualError(null)
    setPrompt('')
    setIncludeAuthoring(true)
    setAgenticError(null)
  }

  // Entering agentic mode: preselect the header picker's current choice so
  // the dropdown shows what would run and lets the user pick another model.
  const startAgentic = (): void => {
    setModel(modelsQuery.data?.selected ?? null)
    setMode('agentic')
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = async (): Promise<void> => {
    setBusy(true)
    setManualError(null)
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
      onOpenChange(false)
    } catch (e) {
      setManualError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const startGeneration = (): void => {
    if (prompt.trim() === '' || skill === undefined) return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    // The agent edits the existing skill directory in place (the backend
    // wraps the prompt to target .agents/skills/<skillId>/SKILL.md). We
    // generate the run id so the run page URL is known now.
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'skillAgentic',
      runId,
      text: prompt.trim(),
      useAuthoringSkill: includeAuthoring && hasAuthoringSkill,
      skillName: skillId,
      model: model ?? undefined,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  const title = titleFromSlug(skill?.name ?? skillId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) start()
        else onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'choose' && `Modify ${title}`}
            {mode === 'manual' && `Edit ${title}`}
            {mode === 'agentic' && `Ask an agent to modify ${title}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' &&
              'Skills live in .agents/skills/<name>/SKILL.md — a frontmatter block plus instructions.'}
            {mode === 'manual' && (
              <>
                Edits the raw <code className="rounded bg-muted px-1">SKILL.md</code> — frontmatter
                included.
              </>
            )}
            {mode === 'agentic' &&
              'Describe the change you want — the agent runs in the live session, edits the skill in place, and streams to the session page where you can answer back.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start py-6"
              onClick={() => setMode('manual')}
            >
              <Pencil className="size-4 text-muted-foreground" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Edit it manually</span>
                <span className="text-xs font-normal text-muted-foreground">
                  You control the full markdown — frontmatter and body.
                </span>
              </span>
            </Button>
            <Button variant="outline" className="justify-start py-6" onClick={startAgentic}>
              <Sparkles className="size-4 text-muted-foreground" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Ask an agent</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Describe the change in plain words; the agent works in the live session.
                </span>
              </span>
            </Button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="flex flex-col gap-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              className="min-h-80 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {manualError !== null && <p className="text-xs text-red-500">{manualError}</p>}
          </div>
        )}

        {mode === 'agentic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <AiInput
                value={prompt}
                onChange={setPrompt}
                folder={folder}
                label="Change"
                prompt={describeSkill(skill)}
                placeholder="e.g. Tighten the checklist — require a test for every fix…"
                className="min-h-40"
              />
              {hasAuthoringSkill && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={includeAuthoring}
                    onChange={(event) => setIncludeAuthoring(event.target.checked)}
                    className="mt-0.5 size-3.5 accent-primary"
                  />
                  <span>
                    Include the <code className="rounded bg-muted px-1">authoring-skills</code>{' '}
                    skill — the agent follows this workspace's skill-authoring conventions.
                  </span>
                </label>
              )}
              {folder === null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Workspace not connected — agentic modification needs a running /montflow session.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="modify-skill-model"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Model
                </label>
                <ModelSelect conn={conn} value={model} onChange={setModel} />
              </div>
              {agenticError !== null && <p className="text-xs text-red-500">{agenticError}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {mode !== 'choose' && (
            <Button variant="ghost" onClick={() => setMode('choose')}>
              <ArrowLeft className="size-3.5" />
              Mode
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'manual' && (
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          )}
          {mode === 'agentic' && (
            <Button
              onClick={startGeneration}
              disabled={prompt.trim() === '' || skill === undefined}
            >
              <Sparkles className="size-3.5" />
              Run agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One-line summary of the current skill, used to pre-fill the modify AI modal. */
const describeSkill = (skill: SkillDetailType | undefined): string => {
  if (skill === undefined) return ''
  const groups = skill.groups.length > 0 ? ` Groups: [${skill.groups.join(', ')}].` : ''
  const deps =
    skill.dependencies.length > 0 ? ` Dependencies: [${skill.dependencies.join(', ')}].` : ''
  return `Modify the skill '${skill.name}' at .agents/skills/${skill.id}/SKILL.md. It is currently described as: '${skill.description}'.${groups}${deps}`
}
