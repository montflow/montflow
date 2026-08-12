import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { skillsFromMarkdown, withSkills } from '@/lib/frontmatter'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { ModelSelect } from '@/components/ModelSelect'
import { SkillPicker } from '@/components/SkillPicker'
import { runUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { ProfileDetail } from '@/protocol'
import { ArrowLeft, ArrowUpRight, Loader2, Pencil, Sparkles } from 'lucide-react'

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

  // Selected skills live in the `skills:` frontmatter list of the pasted
  // markdown (manual mode) or in their own state (agentic mode).
  const selectedSkills = useMemo(() => skillsFromMarkdown(markdown), [markdown])

  // Agentic mode
  const [agenticSkills, setAgenticSkills] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  /** Per-run model override (`provider/model-id`); null = header picker default. */
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  const reset = (): void => {
    setMode('choose')
    setName('')
    setMarkdown('')
    setAgenticSkills([])
    setPrompt('')
    setModel(null)
    setAgenticError(null)
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
      skills: agenticSkills.length > 0 ? agenticSkills : undefined,
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
            <SkillPicker
              workspaceId={workspaceId}
              conn={conn}
              selected={selectedSkills}
              onChange={(skills) => setMarkdown(withSkills(markdown, skills))}
              inputId="profile-skills-search"
            />
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
              <SkillPicker
                workspaceId={workspaceId}
                conn={conn}
                selected={agenticSkills}
                onChange={setAgenticSkills}
                inputId="profile-agentic-skills"
                label="Skills to include"
              />
              <p className="-mt-1 text-[11px] text-muted-foreground">
                The agent will add these skills to the profile's frontmatter.
              </p>
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
