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
import { ModelSelect } from '@/components/ModelSelect'
import { useProfileDetail, useDeleteProfile } from '@/lib/useProfiles'
import { useSkillNameToIdMap } from '@/lib/useSkills'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { runUrl, skillUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { titleFromSlug } from '@/lib/utils'
import type { ProfileDetail as ProfileDetailType } from '@/protocol'
import {
  ArrowLeft,
  ArrowUpRight,
  ListChecks,
  Loader2,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react'

interface ProfileDetailProps {
  workspaceId: string
  profileName: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
}

export function ProfileDetail({ workspaceId, profileName, conn, folder }: ProfileDetailProps) {
  const queryClient = useQueryClient()
  const { data: profile, isPending, isError, error, refetch } = useProfileDetail(
    workspaceId,
    profileName,
    conn,
  )
  // Profiles reference skills by frontmatter name; the detail route is keyed
  // by directory slug, so resolve names to slugs for the skill links.
  const skillIdBySlug = useSkillNameToIdMap(workspaceId, conn)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Filters are in the query string (see ProfilesSection) — carry them through
  // so "Back to workspace" restores the exact list the user left.
  const back = (): void => navigate(workspaceUrl(workspaceId) + location.search)

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
      ) : profile !== undefined ? (
        <>
          <ProfileHeader
            profile={profile}
            skillIdBySlug={skillIdBySlug}
            workspaceId={workspaceId}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <EditProfileDialog
            profile={profile}
            workspaceId={workspaceId}
            folder={folder}
            conn={conn}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ['profiles', workspaceId] })
              setEditOpen(false)
            }}
          />
          <DeleteProfileDialog
            workspaceId={workspaceId}
            profileName={profileName}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={back}
          />
        </>
      ) : null}
    </main>
  )
}

function ProfileHeader({
  profile,
  skillIdBySlug,
  workspaceId,
  onEdit,
  onDelete,
}: {
  profile: ProfileDetailType
  skillIdBySlug: Map<string, string>
  workspaceId: string
  onEdit: () => void
  onDelete: () => void
}) {
  // The markdown preview is width-constrained for readability; the expand
  // button in the corner flips it to the full container width.
  const [previewExpanded, setPreviewExpanded] = useState(false)
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{titleFromSlug(profile.name)}</h1>
          {profile.description !== '' && (
            <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
          )}
          {(profile.model !== '' || profile.skills.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {profile.model !== '' && (
                <Badge variant="secondary" title="preferred model">
                  <Sparkles className="size-3" />
                  <span className="font-mono">{profile.model}</span>
                </Badge>
              )}
              {profile.skills.map((skill) => {
                const id = skillIdBySlug.get(skill)
                return id !== undefined ? (
                  <Badge
                    key={skill}
                    variant="outline"
                    asChild
                    className="hover:border-primary/40 hover:text-foreground"
                  >
                    <a
                      href={skillUrl(workspaceId, id)}
                      title={`Open skill ${skill}`}
                      onClick={(event) => {
                        event.preventDefault()
                        navigate(skillUrl(workspaceId, id))
                      }}
                    >
                      {skill}
                    </a>
                  </Badge>
                ) : (
                  <Badge key={skill} variant="outline" title={`Unknown skill: ${skill}`}>
                    {skill}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {profile.instructions !== '' && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MessageSquareText className="size-4" />
            Instructions
          </h2>
          <div className="relative">
            <div
              className={`prose dark:prose-invert ${previewExpanded ? 'max-w-none' : 'max-w-prose'}`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.instructions}</ReactMarkdown>
            </div>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setPreviewExpanded((value) => !value)}
              title={previewExpanded ? 'Constrain to readable width' : 'Expand to full width'}
              aria-label={previewExpanded ? 'Constrain to readable width' : 'Expand to full width'}
              className="absolute bottom-2 right-2"
            >
              {previewExpanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </Button>
          </div>
        </section>
      )}

      {profile.checklist.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ListChecks className="size-4" />
            Review Checklist
          </h2>
          <ul className="space-y-1.5 text-sm">
            {profile.checklist.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-0.5 block size-3.5 shrink-0 rounded border border-muted-foreground/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Stored at{' '}
        <code className="rounded bg-muted px-1">
          .agents/@montflow/profiles/{profile.name}/PROFILE.md
        </code>
      </p>
    </div>
  )
}

type EditMode = 'choose' | 'manual' | 'agentic'

/** Edit dialog — lets the user rewrite the PROFILE.md by hand or ask an agent. */
function EditProfileDialog({
  profile,
  workspaceId,
  folder,
  conn,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: ProfileDetailType
  workspaceId: string
  folder: string | null
  conn: 'connecting' | 'open' | 'closed'
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after the manual PUT succeeds — the parent invalidates queries. */
  onSaved: () => void
}) {
  const { sendCommand } = useUiSocket()
  const modelsQuery = useModels(conn)
  const [mode, setMode] = useState<EditMode>('choose')

  // Manual mode
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Agentic mode
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  const reset = (): void => {
    setMode('choose')
    setDraft('')
    setSaving(false)
    setSaveError(null)
    setPrompt('')
    setModel(null)
    setAgenticError(null)
  }

  // Re-arm the dialog each time it opens.
  const start = (): void => {
    reset()
    setDraft(profile.markdown)
  }

  const startAgentic = (): void => {
    // Preselect the header picker's current choice so the dropdown shows
    // what would run and lets the user pick another model.
    setModel(modelsQuery.data?.selected ?? null)
    setPrompt(describeProfile(profile))
    setMode('agentic')
  }

  const generate = (): void => {
    if (prompt.trim() === '') return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    // The backend runs the profile modification in its own isolated agent
    // session. We generate the run id so the run page URL is known now.
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'profileAgentic',
      runId,
      text: prompt.trim(),
      model: model ?? undefined,
      profileName: profile.name,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/profiles/${encodeURIComponent(profile.name)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown: draft }),
        },
      )
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: string }
          if (typeof data.error === 'string') message = data.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      onSaved()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const modeBack = (): void => setMode('choose')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) start()
        else onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'choose' && `Edit ${titleFromSlug(profile.name)}`}
            {mode === 'manual' && 'Write it manually'}
            {mode === 'agentic' && 'Ask an agent to edit'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' &&
              'Rewrites .agents/@montflow/profiles/<name>/PROFILE.md — frontmatter (name, description, model, skills) plus Instructions and a Review Checklist.'}
            {mode === 'manual' && 'Edit the full PROFILE.md content (frontmatter + body).'}
            {mode === 'agentic' &&
              'Describe the change in plain words — the run happens in the live session, streamed to the session page where you can answer back.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start py-6" onClick={() => setMode('manual')}>
              <Pencil className="size-4 text-muted-foreground" />
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-medium">Write it manually</span>
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-edit-markdown" className="text-xs font-medium text-muted-foreground">
                PROFILE.md
              </label>
              <textarea
                id="profile-edit-markdown"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                className="min-h-80 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {saveError !== null && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
        )}

        {mode === 'agentic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-edit-prompt" className="text-xs font-medium text-muted-foreground">
                Change
              </label>
              <textarea
                id="profile-edit-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {folder === null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Workspace not connected — agentic editing needs a running /montflow session.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-edit-model" className="text-xs font-medium text-muted-foreground">
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
            <Button variant="ghost" onClick={modeBack}>
              <ArrowLeft className="size-3.5" />
              Mode
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {mode === 'manual' && (
            <Button onClick={() => void save()} disabled={saving || draft.trim() === ''}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save
                  <ArrowUpRight className="size-3.5" />
                </>
              )}
            </Button>
          )}
          {mode === 'agentic' && (
            <Button onClick={generate} disabled={prompt.trim() === ''}>
              <Sparkles className="size-3.5" />
              Run agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Delete confirmation — removes the profile's directory from the workspace. */
function DeleteProfileDialog({
  workspaceId,
  profileName,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  profileName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const deleteProfile = useDeleteProfile(workspaceId)
  const [error, setError] = useState<string | null>(null)

  const remove = (): void => {
    deleteProfile.mutate(profileName, {
      onSuccess: onDeleted,
      onError: (e) => setError(e instanceof Error ? e.message : 'Failed to delete profile'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete profile?</DialogTitle>
          <DialogDescription>
            This permanently removes{' '}
            <code className="rounded bg-muted px-1">
              .agents/@montflow/profiles/{profileName}/
            </code>{' '}
            from the workspace. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error !== null && <p className="text-xs text-red-500">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteProfile.isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={deleteProfile.isPending}>
            {deleteProfile.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One-line summary of the current profile, used to seed the edit prompt. */
const describeProfile = (profile: ProfileDetailType): string => {
  const skills = profile.skills.length > 0 ? profile.skills.join(', ') : 'none'
  const model = profile.model !== '' ? profile.model : 'none'
  return `Modify the profile '${profile.name}'. It currently has description "${profile.description}", preferred model ${model}, loads skills [${skills}], and ${profile.checklist.length} review checklist item${profile.checklist.length === 1 ? '' : 's'}.`
}
