import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkillPicker } from '@/components/SkillPicker'
import { TemplateEditor } from '@/components/TemplateEditor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeletePrompt, usePromptDetail, useSavePrompt } from '@/lib/usePrompts'
import { PromptInputPreviewDialog } from '@/components/PromptInputPreviewDialog'
import { promptUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { PromptVariable } from '@/protocol'
import {
  Braces,
  Eye,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

interface PromptDetailProps {
  workspaceId: string
  promptName: string
  conn: 'connecting' | 'open' | 'closed'
}

export function PromptDetail({ workspaceId, promptName, conn }: PromptDetailProps) {
  const { data: prompt, isPending, isError, error, refetch } = usePromptDetail(
    workspaceId,
    promptName,
    conn,
  )
  const savePrompt = useSavePrompt(workspaceId)
  const deletePrompt = useDeletePrompt(workspaceId)

  const [template, setTemplate] = useState('')
  const [variables, setVariables] = useState<PromptVariable[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [name, setName] = useState(promptName)

  // Re-arm editor state when navigating between prompts (component instance
  // is reused across /prompts/<a>/ → /prompts/<b>/).
  useEffect(() => {
    setName(promptName)
    setTemplate(prompt?.template ?? '')
    setVariables(prompt?.variables ? [...prompt.variables] : [])
    setSkills(prompt?.skills ? [...prompt.skills] : [])
    setDirty(false)
    setSaveError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptName])

  const back = (): void => navigate(workspaceUrl(workspaceId))

  /** Variable tokens may only contain A–Z, a–z, 0–9, `_` and `-` (no spaces). */
  const cleanVariableToken = (label: string): string => label.replace(/[^a-zA-Z0-9_-]/g, '')

  const updateLabel = (index: number, label: string): void => {
    const clean = cleanVariableToken(label)
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, label: clean, name: clean } : v)),
    )
    setDirty(true)
  }

  const updateVariable = (index: number, patch: Partial<PromptVariable>): void => {
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))
    setDirty(true)
  }

  const removeVariable = (index: number): void => {
    setVariables((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  const addVariable = (): void => {
    const n = variables.length + 1
    const label = `variable${n}`
    setVariables((prev) => [...prev, { name: label, label, default: undefined }])
    setDirty(true)
  }

  const save = (): void => {
    if (savePrompt.isPending) return
    const draftName = name.trim()
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(draftName)) {
      setSaveError('Name must use letters, digits, . _ - and start with a letter or digit.')
      return
    }
    const renamed = draftName !== promptName
    savePrompt.mutate(
      {
        name: draftName,
        template,
        variables,
        skills,
      },
      {
        onSuccess: () => {
          if (renamed) {
            // Created/overwrote the new file — now drop the old one and land
            // on the renamed prompt's page.
            deletePrompt.mutate(promptName, {
              onSuccess: () => navigate(promptUrl(workspaceId, draftName)),
              onError: () => navigate(promptUrl(workspaceId, draftName)),
            })
            return
          }
          setDirty(false)
          setSaveError(null)
        },
        onError: (e) => setSaveError(e instanceof Error ? e.message : 'Failed to save prompt'),
      },
    )
  }

  const remove = (): void => {
    if (deletePrompt.isPending) return
    deletePrompt.mutate(promptName, {
      onSuccess: back,
      onError: (e) => setSaveError(e instanceof Error ? e.message : 'Failed to delete prompt'),
    })
  }

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={back}
          className="mb-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to workspace
        </button>

        {isError && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-500">
            <span className="truncate">{error instanceof Error ? error.message : String(error)}</span>
            <Button size="xs" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}

        {isPending ? (
          <div className="mt-6 space-y-3">
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-48 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : prompt === null ? (
          <p className="mt-6 text-sm text-muted-foreground">Prompt not found.</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-xl font-semibold">
                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setDirty(true)
                    }}
                    aria-label="Prompt name"
                    spellCheck={false}
                    className="h-9 w-full min-w-40 max-w-xs font-mono text-lg font-semibold"
                  />
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-300">
                    <Sparkles className="size-3" />
                    prompt
                  </span>
                </h1>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  .agents/@montflow/prompts/{name.trim() || '…'}.json
                  <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold">
                    v{prompt.version ?? 1}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={deletePrompt.isPending}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>

            {prompt.error !== undefined && (
              <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-500">
                This prompt file could not be parsed: {prompt.error}
              </p>
            )}

            {/* Editor */}
            <section className="mt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Sparkles className="size-4" />
                  Prompt factory
                </h2>
                <div className="flex items-center gap-2">
                  {dirty && (
                    <span className="text-[11px] text-muted-foreground">Unsaved changes</span>
                  )}
                  <Button size="xs" variant="outline" onClick={() => setPreviewOpen(true)}>
                    <Eye className="size-3.5" />
                    View input
                  </Button>
                  <Button size="xs" onClick={save} disabled={savePrompt.isPending || !dirty}>
                    {savePrompt.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                {/* Left — template editor with {{ }} highlighting + autocomplete */}
                <div className="min-w-0">
                  <TemplateEditor
                    value={template}
                    onChange={setTemplate}
                    onDirty={() => setDirty(true)}
                    variables={variables}
                  />
                </div>

                {/* Right — declare the variables first, then reference them in the template */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium text-muted-foreground">
                      Variables ({variables.length})
                    </h3>
                    <Button size="xs" variant="outline" onClick={addVariable}>
                      <Plus className="size-3.5" />
                      Add variable
                    </Button>
                  </div>
                {variables.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-muted/10 p-4 text-center text-xs text-muted-foreground">
                    No variables yet. Add the ones you want to fill in each run, then place their{' '}
                    <code className="rounded bg-muted px-1">{'{{name}}'}</code> tokens in the template —
                    typing {'{{'} in the template autocompletes from these.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {variables.map((v, index) => (
                      <li key={index} className="flex flex-col gap-1.5 rounded-md border bg-card p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
                            <Braces className="size-3 shrink-0" />
                            <span className="truncate">{'{'}{'{'}{v.name || 'name'}{'}'}{'}'}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => removeVariable(index)}
                            title="Remove variable"
                            className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-500"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <Input
                          aria-label="Variable label"
                          autoComplete="off"
                          value={v.label ?? ''}
                          placeholder="files-to-audit"
                          title="Only letters, numbers, _ and - (no spaces)"
                          onChange={(event) => updateLabel(index, event.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                        <Input
                          aria-label="Default value (optional)"
                          autoComplete="off"
                          value={v.default ?? ''}
                          placeholder="Default (optional)"
                          onChange={(event) =>
                            updateVariable(index, {
                              default: event.target.value === '' ? undefined : event.target.value,
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              </div>

              {/* Attached skills — loaded into the run's context */}
              <div className="flex flex-col gap-2">
                <SkillPicker
                  workspaceId={workspaceId}
                  conn={conn}
                  selected={skills}
                  onChange={(next) => {
                    setSkills(next)
                    setDirty(true)
                  }}
                  inputId="prompt-skills"
                  label="Skills"
                />
                <p className="text-[11px] text-muted-foreground">
                  Attached skills are loaded into the agent's context when you run this prompt, so
                  it follows their instructions.
                </p>
              </div>

              {saveError !== null && <p className="text-xs text-red-500">{saveError}</p>}
            </section>
          </>
        )}
      </div>

      <DeletePromptDialog
        promptName={promptName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={remove}
        pending={deletePrompt.isPending}
      />

      <PromptInputPreviewDialog
        workspaceId={workspaceId}
        promptName={name.trim() === '' ? promptName : name.trim()}
        template={template}
        variables={variables}
        skills={skills}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </main>
  )
}

function DeletePromptDialog({
  promptName,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  promptName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete prompt?</DialogTitle>
          <DialogDescription>
            This permanently removes{' '}
            <code className="rounded bg-muted px-1">
              .agents/@montflow/prompts/{promptName}.json
            </code>{' '}
            from the workspace. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
