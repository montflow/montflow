import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateProfile } from '@/lib/useProfiles'
import { useSkills } from '@/lib/useSkills'
import { skillsFromMarkdown, withSkills } from '@/lib/frontmatter'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { ModelSelect } from '@/components/ModelSelect'
import { runUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { ProfileDetail } from '@/protocol'
import { ArrowLeft, ArrowUpRight, Loader2, Pencil, Search, Sparkles, X } from 'lucide-react'

interface NewProfileDialogProps {
  workspaceId: string
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a manual create — carries the created profile for navigation. */
  onCreated: (profile: ProfileDetail) => void
}

type Mode = 'choose' | 'manual' | 'agentic'

export function NewProfileDialog({
  workspaceId,
  folder,
  open,
  onOpenChange,
  onCreated,
}: NewProfileDialogProps) {
  const { sendCommand, conn } = useUiSocket()
  const createProfile = useCreateProfile(workspaceId)
  // Model override for this run: preselect the header picker's current
  // choice so the user can switch to a different model (null = default).
  const modelsQuery = useModels(conn)

  const [mode, setMode] = useState<Mode>('choose')

  // Manual mode
  const [name, setName] = useState('')
  const [markdown, setMarkdown] = useState('')

  // Skills picker (manual mode) — chips are kept in sync with the `skills:`
  // frontmatter list of the pasted markdown.
  const skillsQuery = useSkills(workspaceId, conn)
  const [skillQuery, setSkillQuery] = useState('')
  const [skillOpen, setSkillOpen] = useState(false)

  const selectedSkills = useMemo(() => skillsFromMarkdown(markdown), [markdown])

  /** Skills available to add: filtered by query, already-selected ones hidden. */
  const skillResults = useMemo(() => {
    const all = skillsQuery.data ?? []
    const selected = new Set(selectedSkills)
    const trimmed = skillQuery.trim().toLowerCase()
    const matches = all.filter((skill) => {
      if (selected.has(skill.name)) return false
      if (trimmed === '') return true
      return (
        skill.name.toLowerCase().includes(trimmed) ||
        skill.description.toLowerCase().includes(trimmed) ||
        skill.groups.some((group) => group.toLowerCase().includes(trimmed))
      )
    })
    // Preview a handful on click; typed queries reveal more matches.
    return trimmed === '' ? matches.slice(0, 5) : matches.slice(0, 12)
  }, [skillsQuery.data, selectedSkills, skillQuery])

  const toggleSkill = (skillName: string): void => {
    const next = new Set(selectedSkills)
    if (next.has(skillName)) next.delete(skillName)
    else next.add(skillName)
    setMarkdown(withSkills(markdown, [...next]))
  }

  // Agentic mode
  const [prompt, setPrompt] = useState('')
  /** Per-run model override (`provider/model-id`); null = header picker default. */
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  const reset = (): void => {
    setMode('choose')
    setName('')
    setMarkdown('')
    setPrompt('')
    setModel(null)
    setAgenticError(null)
    setSkillQuery('')
    setSkillOpen(false)
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Entering agentic mode: preselect the header picker's current choice so
  // the dropdown shows what would run and lets the user pick another model.
  const startAgentic = (): void => {
    setModel(modelsQuery.data?.selected ?? null)
    setMode('agentic')
  }

  const startGeneration = (): void => {
    if (prompt.trim() === '') return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    // The backend runs the profile authoring in its own isolated agent
    // session. We generate the run id so the run page URL is known now.
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'profileAgentic',
      runId,
      text: prompt.trim(),
      model: model ?? undefined,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  const submitManual = (): void => {
    createProfile.mutate(
      { name: name.trim(), markdown },
      {
        onSuccess: (profile) => {
          onCreated(profile)
          onOpenChange(false)
        },
      },
    )
  }

  const modeBack = (): void => setMode('choose')

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'choose' && 'New profile'}
            {mode === 'manual' && 'Write a profile'}
            {mode === 'agentic' && 'Ask an agent to write a profile'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' &&
              'Profiles live in .agents/@montflow/profiles/<name>/PROFILE.md — frontmatter (name, description, model, skills) plus Instructions and a Review Checklist.'}
            {mode === 'manual' && 'Paste the full PROFILE.md content (frontmatter + body).'}
            {mode === 'agentic' &&
              'Describe the agent you want — the run happens in the live session, streamed to the session page where you can answer back.'}
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
                  Describe the agent in plain words; the agent works in the live session.
                </span>
              </span>
            </Button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-name" className="text-xs font-medium text-muted-foreground">
                Name (kebab-case)
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="code-reviewer"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-skills-search" className="text-xs font-medium text-muted-foreground">
                Skills
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-skills-search"
                  value={skillQuery}
                  onChange={(event) => {
                    setSkillQuery(event.target.value)
                    setSkillOpen(true)
                  }}
                  onFocus={() => setSkillOpen(true)}
                  onBlur={() => setSkillOpen(false)}
                  autoComplete="off"
                  disabled={skillsQuery.isPending || (skillsQuery.data?.length ?? 0) === 0}
                  placeholder={
                    skillsQuery.isPending
                      ? 'Loading skills…'
                      : (skillsQuery.data?.length ?? 0) === 0
                        ? 'No skills in this workspace yet'
                        : 'Search existing skills…'
                  }
                  className="pl-8"
                />
                {skillOpen && skillResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
                    <div className="max-h-56 overflow-y-auto">
                      {skillResults.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => toggleSkill(skill.name)}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                        >
                          <span className="font-mono text-xs font-medium">{skill.name}</span>
                          {skill.description !== '' && (
                            <span className="line-clamp-1 text-[11px] text-muted-foreground">
                              {skill.description}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {skillOpen && skillQuery.trim() !== '' && skillResults.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No matching skills.</p>
                )}
              </div>
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                      <span className="font-mono">{skill}</span>
                      <button
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        title={`Remove ${skill}`}
                        aria-label={`Remove ${skill}`}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-markdown" className="text-xs font-medium text-muted-foreground">
                PROFILE.md
              </label>
              <textarea
                id="profile-markdown"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                spellCheck={false}
                placeholder={'---\nname: code-reviewer\ndescription: one line: role and job\n---\n\n# Title\n\n## Instructions\n\n…\n\n## Review Checklist\n\n- [ ] …'}
                className="min-h-64 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {createProfile.isError && (
              <p className="text-xs text-red-500">
                {createProfile.error instanceof Error
                  ? createProfile.error.message
                  : 'Failed to create profile'}
              </p>
            )}
          </div>
        )}

        {mode === 'agentic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-prompt" className="text-xs font-medium text-muted-foreground">
                Prompt
              </label>
              <textarea
                id="profile-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="e.g. A rigorous code-reviewer agent that audits diffs for bugs, security holes, and test gaps…"
                className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {folder === null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Workspace not connected — agentic creation needs a running /montflow session.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="profile-model" className="text-xs font-medium text-muted-foreground">
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
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {mode === 'manual' && (
            <Button
              onClick={submitManual}
              disabled={createProfile.isPending || name.trim() === '' || markdown.trim() === ''}
            >
              {createProfile.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create profile
                  <ArrowUpRight className="size-3.5" />
                </>
              )}
            </Button>
          )}
          {mode === 'agentic' && (
            <Button onClick={startGeneration} disabled={prompt.trim() === ''}>
              <Sparkles className="size-3.5" />
              Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
