import { useEffect, useState } from 'react'
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
import { useCreateSkill, useSkills } from '@/lib/useSkills'
import { useUiSocket } from '@/lib/useUiSocket'
import { useModels } from '@/lib/useModels'
import { ModelSelect } from '@/components/ModelSelect'
import { runUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { SkillDetail } from '@/protocol'
import { ArrowLeft, ArrowUpRight, Loader2, Pencil, Sparkles } from 'lucide-react'

interface NewSkillDialogProps {
  workspaceId: string
  /** Folder slug for agentic commands (from workspace info); null when offline. */
  folder: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a manual create — carries the created skill for navigation. */
  onCreated: (skill: SkillDetail) => void
}

type Mode = 'choose' | 'manual' | 'agentic'

export function NewSkillDialog({
  workspaceId,
  folder,
  open,
  onOpenChange,
  onCreated,
}: NewSkillDialogProps) {
  const { sendCommand, conn } = useUiSocket()
  const createSkill = useCreateSkill(workspaceId)
  // Model override for this run: preselect the header picker's current
  // choice so the user can switch to a different model (null = default).
  const modelsQuery = useModels(conn)
  // The "include authoring skill" toggle only appears when the workspace
  // actually has the authoring-skills skill (the backend loads it by name).
  const skillsQuery = useSkills(workspaceId, conn)
  const hasAuthoringSkill = (skillsQuery.data ?? []).some(
    (skill) => skill.id === 'authoring-skills' || skill.name === 'authoring-skills',
  )

  const [mode, setMode] = useState<Mode>('choose')

  // Manual mode
  const [name, setName] = useState('')
  const [markdown, setMarkdown] = useState('')

  // Agentic mode
  const [prompt, setPrompt] = useState('')
  const [includeAuthoring, setIncludeAuthoring] = useState(true)
  /** Per-run model override (`provider/model-id`); null = header picker default. */
  const [model, setModel] = useState<string | null>(null)
  const [agenticError, setAgenticError] = useState<string | null>(null)

  const reset = (): void => {
    setMode('choose')
    setName('')
    setMarkdown('')
    setPrompt('')
    setIncludeAuthoring(true)
    setModel(null)
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
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const startGeneration = (): void => {
    if (prompt.trim() === '') return
    if (folder === null) {
      setAgenticError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    // The backend runs the skill authoring in its own isolated agent
    // session. We generate the run id so the run page URL is known now.
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'skillAgentic',
      runId,
      text: prompt.trim(),
      useAuthoringSkill: includeAuthoring && hasAuthoringSkill,
      model: model ?? undefined,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  const submitManual = (): void => {
    createSkill.mutate(
      { name: name.trim(), markdown },
      {
        onSuccess: (skill) => {
          onCreated(skill)
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
            {mode === 'choose' && 'New skill'}
            {mode === 'manual' && 'Write a skill'}
            {mode === 'agentic' && 'Ask an agent to write a skill'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'choose' &&
              'Skills live in .agents/skills/<name>/SKILL.md — a frontmatter block plus instructions.'}
            {mode === 'manual' && 'Paste the full SKILL.md content (frontmatter + body).'}
            {mode === 'agentic' &&
              'Describe the skill you want — the run happens in the live session, streamed to the session page where you can answer back.'}
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
                  Describe the skill in plain words; the agent works in the live session.
                </span>
              </span>
            </Button>
          </div>
        )}

        {mode === 'manual' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="skill-name" className="text-xs font-medium text-muted-foreground">
                Name (kebab-case)
              </label>
              <Input
                id="skill-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="my-cool-skill"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="skill-markdown" className="text-xs font-medium text-muted-foreground">
                SKILL.md
              </label>
              <textarea
                id="skill-markdown"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                spellCheck={false}
                placeholder={'---\nname: my-cool-skill\ndescription: when to use it\n---\n\nBody…'}
                className="min-h-64 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {createSkill.isError && (
              <p className="text-xs text-red-500">
                {createSkill.error instanceof Error ? createSkill.error.message : 'Failed to create skill'}
              </p>
            )}
          </div>
        )}

        {mode === 'agentic' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="skill-prompt" className="text-xs font-medium text-muted-foreground">
                Prompt
              </label>
              <textarea
                id="skill-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="e.g. A skill that audits TypeScript code for Result-over-throws error handling…"
                className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                    Include the <code className="rounded bg-muted px-1">authoring-skills</code> skill
                    — the agent follows this workspace's skill-authoring conventions.
                  </span>
                </label>
              )}
              {folder === null && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Workspace not connected — agentic creation needs a running /montflow session.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skill-model" className="text-xs font-medium text-muted-foreground">
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
              disabled={createSkill.isPending || name.trim() === '' || markdown.trim() === ''}
            >
              {createSkill.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create skill
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
