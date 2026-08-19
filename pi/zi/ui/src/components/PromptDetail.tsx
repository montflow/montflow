import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkillPicker } from '@/components/SkillPicker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeletePrompt, usePromptDetail, useSavePrompt } from '@/lib/usePrompts'
import { useUiSocket } from '@/lib/useUiSocket'
import { promptPlaceholders, renderPrompt, templateUsesVariable } from '@/lib/prompt'
import { runUrl, workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import { cn, titleFromSlug } from '@/lib/utils'
import type { PromptVariable } from '@/protocol'
import {
  Braces,
  CornerDownLeft,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

interface PromptDetailProps {
  workspaceId: string
  promptName: string
  conn: 'connecting' | 'open' | 'closed'
  /** Folder slug for running the prompt; null when the workspace is offline. */
  folder: string | null
}

export function PromptDetail({ workspaceId, promptName, conn, folder }: PromptDetailProps) {
  const { data: prompt, isPending, isError, error, refetch } = usePromptDetail(
    workspaceId,
    promptName,
    conn,
  )
  const savePrompt = useSavePrompt(workspaceId)
  const deletePrompt = useDeletePrompt(workspaceId)

  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const [variables, setVariables] = useState<PromptVariable[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [runOpen, setRunOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // `{{` template autocomplete — open token position + partial name typed.
  const templateRef = useRef<HTMLTextAreaElement>(null)
  const [ac, setAc] = useState<{ open: number; query: string; index: number } | null>(null)

  // Re-arm editor state when navigating between prompts (component instance
  // is reused across /prompts/<a>/ → /prompts/<b>/).
  useEffect(() => {
    setDescription(prompt?.description ?? '')
    setTemplate(prompt?.template ?? '')
    setVariables(prompt?.variables ? [...prompt.variables] : [])
    setSkills(prompt?.skills ? [...prompt.skills] : [])
    setAc(null)
    setDirty(false)
    setSaveError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptName])

  const back = (): void => navigate(workspaceUrl(workspaceId))

  const toggleRequired = (index: number): void => {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, required: !(v.required ?? true) } : v)),
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
    const name = `variable${variables.length + 1}`
    setVariables((prev) => [...prev, { name, required: true }])
    setDirty(true)
  }

  // `{{` autocomplete — suggestions matching the partial name just typed.
  const acOptions = useMemo(() => {
    if (ac === null) return []
    const q = ac.query.trim().toLowerCase()
    if (q === '') return variables
    return variables.filter((v) => v.name.toLowerCase().includes(q))
  }, [ac, variables])

  /** Close the open `{{name` token and insert the accepted variable. */
  const acceptAutocomplete = (name: string | undefined): void => {
    if (name === undefined) return
    const el = templateRef.current
    const cursor = el?.selectionStart ?? ac?.open ?? 0
    const before = template.slice(0, cursor)
    const lastOpen = before.lastIndexOf('{{')
    if (lastOpen === -1) return
    const token = `{{${name}}}`
    const next = template.slice(cursor)
    setTemplate(before.slice(0, lastOpen) + token + next)
    setDirty(true)
    setAc(null)
    // Place the caret after the closing braces.
    requestAnimationFrame(() => {
      el?.focus()
      const pos = lastOpen + token.length
      el?.setSelectionRange(pos, pos)
    })
  }

  /** Textarea change: detect an in-progress `{{...` token to open the popup. */
  const onTemplateChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const el = event.currentTarget
    const value = el.value
    const cursor = el.selectionStart
    setTemplate(value)
    setDirty(true)

    const before = value.slice(0, cursor)
    const lastOpen = before.lastIndexOf('{{')
    const lastClose = before.lastIndexOf('}}')
    // Inside `{{...` (no closing braces since the open token) → autocomplete.
    if (lastOpen !== -1 && (lastClose === -1 || lastClose < lastOpen)) {
      const partial = value.slice(lastOpen + 2, cursor)
      if (!/[{}]/.test(partial)) {
        setAc({ open: lastOpen, query: partial, index: 0 })
        return
      }
    }
    setAc(null)
  }

  const onTemplateKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (ac === null || acOptions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAc((prev) => (prev === null ? prev : { ...prev, index: (prev.index + 1) % acOptions.length }))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAc((prev) =>
        prev === null
          ? prev
          : { ...prev, index: (prev.index - 1 + acOptions.length) % acOptions.length },
      )
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      acceptAutocomplete(acOptions[ac.index]?.name)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setAc(null)
    }
  }

  const save = (): void => {
    if (savePrompt.isPending) return
    savePrompt.mutate(
      {
        name: promptName,
        description: description.trim() === '' ? undefined : description,
        template,
        variables,
        skills,
      },
      {
        onSuccess: () => {
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

  // Editor-only stats for hints below the template.
  const placeholders = useMemo(() => promptPlaceholders(template), [template])
  const unusedVariables = variables.filter((v) => !templateUsesVariable(template, v.name))
  const orphanPlaceholders = placeholders.filter(
    (name) => !variables.some((v) => v.name === name),
  )

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl">
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
                  <span className="truncate">{titleFromSlug(promptName)}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-600 dark:text-violet-300">
                    <Sparkles className="size-3" />
                    prompt
                  </span>
                </h1>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  .agents/@montflow/prompts/{promptName}.json
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
                  <Button size="xs" onClick={save} disabled={savePrompt.isPending || !dirty}>
                    {savePrompt.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="prompt-desc" className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <Input
                  id="prompt-desc"
                  autoComplete="off"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value)
                    setDirty(true)
                  }}
                  placeholder="What this prompt does"
                />
              </div>

              {/* Variables — declared first, so the template can autocomplete on them */}
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
                      <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
                        <div className="flex min-w-32 flex-1 flex-col gap-1">
                          <Input
                            aria-label="Variable name"
                            autoComplete="off"
                            value={v.name}
                            onChange={(event) =>
                              updateVariable(index, { name: event.target.value.replace(/\s+/g, '-') })
                            }
                            className="h-8 font-mono text-xs"
                          />
                          <Input
                            aria-label="Variable label (optional)"
                            autoComplete="off"
                            value={v.label ?? ''}
                            placeholder="Label (optional)"
                            onChange={(event) =>
                              updateVariable(index, {
                                label: event.target.value === '' ? undefined : event.target.value,
                              })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex min-w-32 flex-1 flex-col gap-1">
                          <Input
                            aria-label="Variable description (optional)"
                            autoComplete="off"
                            value={v.description ?? ''}
                            placeholder="Description (optional)"
                            onChange={(event) =>
                              updateVariable(index, {
                                description: event.target.value === '' ? undefined : event.target.value,
                              })
                            }
                            className="h-8 text-xs"
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
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={v.required ?? true}
                            onChange={() => toggleRequired(index)}
                            className="accent-primary"
                          />
                          required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeVariable(index)}
                          title="Remove variable"
                          className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-500"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Template — type {{ to autocomplete a declared variable */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="prompt-tpl" className="text-xs font-medium text-muted-foreground">
                    Template
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Typing {'{{'} opens autocomplete · or insert:</span>
                    {variables.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onClick={() => insertPlaceholder(setTemplate, setDirty, v.name)}
                        title={`Insert {{${v.name}}} at the cursor`}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        {'{{'}{v.name}{'}}'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    ref={templateRef}
                    id="prompt-tpl"
                    value={template}
                    onChange={onTemplateChange}
                    onKeyDown={onTemplateKeyDown}
                    onSelect={captureSelection}
                    onBlur={() => setAc(null)}
                    spellCheck={false}
                    placeholder="Type {{ to pick a variable — e.g. {{files}} …"
                    className="min-h-40 w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  {ac !== null && acOptions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
                      <div className="max-h-44 overflow-y-auto p-1">
                        {acOptions.map((v, index) => (
                          <button
                            key={v.name}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => acceptAutocomplete(v.name)}
                            onMouseEnter={() =>
                              setAc((prev) => (prev === null ? prev : { ...prev, index }))
                            }
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
                              index === ac.index ? 'bg-accent text-accent-foreground' : '',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Braces className="size-3 shrink-0 text-muted-foreground" />
                              <span className="truncate font-mono">{v.name}</span>
                            </span>
                            {index === ac.index && (
                              <CornerDownLeft className="size-3 shrink-0 text-muted-foreground/70" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="border-t bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
                        ↑ ↓ to select · Enter to complete · Esc to dismiss
                      </div>
                    </div>
                  )}
                </div>
                {(unusedVariables.length > 0 || orphanPlaceholders.length > 0) && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {unusedVariables.map((v) => (
                      <span key={v.name} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                        {'{'}{'{'}{v.name}{'}'}{'}'} defined but not placed
                      </span>
                    ))}
                    {orphanPlaceholders.map((name) => (
                      <span key={name} className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">
                        {'{'}{'{'}{name}{'}'}{'}'} has no variable
                      </span>
                    ))}
                  </div>
                )}
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

              {/* Run */}
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">Run this prompt</p>
                  <p className="text-[11px] text-muted-foreground">
                    Collects the variables, renders the template, and dispatches it to an agent run.
                  </p>
                </div>
                <Button onClick={() => setRunOpen(true)} disabled={conn !== 'open'}>
                  <Play className="size-3.5" />
                  Run
                </Button>
              </div>
            </section>
          </>
        )}
      </div>

      <RunPromptDialog
        workspaceId={workspaceId}
        promptName={promptName}
        folder={folder}
        conn={conn}
        template={template}
        variables={variables}
        skills={skills}
        open={runOpen}
        onOpenChange={setRunOpen}
      />

      <DeletePromptDialog
        promptName={promptName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={remove}
        pending={deletePrompt.isPending}
      />
    </main>
  )
}

// --- Insert `{{name}}` at the textarea's last selection (or append) -------

type SelectionCapture = { start: number; end: number }

let lastTemplateSelection: SelectionCapture | null = null

const captureSelection = (event: React.SyntheticEvent<HTMLTextAreaElement>): void => {
  const el = event.currentTarget
  lastTemplateSelection = { start: el.selectionStart, end: el.selectionEnd }
}

const insertPlaceholder = (
  setTemplate: (updater: (prev: string) => string) => void,
  setDirty: (value: boolean) => void,
  name: string,
): void => {
  const sel = lastTemplateSelection ?? { start: 0, end: 0 }
  const token = `{{${name}}}`
  setTemplate((prev) => prev.slice(0, sel.start) + token + prev.slice(sel.end))
  setDirty(true)
}

// --- Run dialog -----------------------------------------------------------

interface RunPromptDialogProps {
  workspaceId: string
  promptName: string
  folder: string | null
  conn: 'connecting' | 'open' | 'closed'
  template: string
  variables: PromptVariable[]
  /** Workspace skills (by SKILL.md frontmatter name) loaded into the run's context. */
  skills: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Collects a value for each variable, renders the template live, and
 * dispatches it as an agentic run (`promptAgentic`) when the user starts it.
 */
function RunPromptDialog({
  folder,
  conn,
  template,
  variables,
  skills,
  promptName,
  open,
  onOpenChange,
}: RunPromptDialogProps) {
  const { sendCommand } = useUiSocket()
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // Seed values from each variable's default every time the dialog opens.
  useEffect(() => {
    if (open) {
      const seed: Record<string, string> = {}
      for (const v of variables) {
        if (v.default !== undefined) seed[v.name] = v.default
      }
      setValues(seed)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const missing = variables.filter((v) => (v.required ?? true) && (values[v.name] ?? '').trim() === '')
  const rendered = renderPrompt(template, values)

  const run = (): void => {
    if (missing.length > 0) {
      setError('Fill in the required variables first.')
      return
    }
    if (folder === null) {
      setError('This workspace is not connected — start /montflow in a pi session first.')
      return
    }
    const runId = crypto.randomUUID()
    sendCommand(folder, {
      type: 'promptAgentic',
      runId,
      text: rendered,
      promptName,
      skills,
    })
    onOpenChange(false)
    navigate(runUrl(runId))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Run prompt</DialogTitle>
          <DialogDescription>
            Fill in the variables — they replace the{' '}
            <code className="rounded bg-muted px-1">{'{{name}}'}</code> placeholders in the template.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
          {variables.map((v) => {
            const label = v.label !== undefined && v.label !== '' ? v.label : v.name
            return (
              <div key={v.name} className="flex flex-col gap-1">
                <label htmlFor={`run-${v.name}`} className="text-xs font-medium text-muted-foreground">
                  {label}
                  {v.required !== false && <span className="ml-1 text-red-500">*</span>}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground/60">
                    {'{{'}{v.name}{'}}'}
                  </span>
                </label>
                {v.description !== undefined && v.description !== '' && (
                  <p className="text-[11px] text-muted-foreground">{v.description}</p>
                )}
                {v.type === 'textarea' ? (
                  <textarea
                    id={`run-${v.name}`}
                    value={values[v.name] ?? ''}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [v.name]: event.target.value }))
                    }
                    rows={3}
                    spellCheck={false}
                    placeholder={v.default ?? ''}
                    className="w-full resize-y rounded-md border border-input bg-transparent p-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                ) : (
                  <Input
                    id={`run-${v.name}`}
                    autoComplete="off"
                    value={values[v.name] ?? ''}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [v.name]: event.target.value }))
                    }
                    placeholder={v.default ?? ''}
                    className="font-mono"
                  />
                )}
              </div>
            )
          })}
          {variables.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No variables — the template runs as-is.
            </p>
          )}
        </div>

        {/* Live rendered preview */}
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Rendered prompt
          </p>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {rendered.trim() === '' ? <span className="text-muted-foreground">(empty)</span> : rendered}
          </pre>
        </div>

        {error !== null && <p className="text-xs text-red-500">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={conn !== 'open'}>
            <Play className="size-3.5" />
            Start run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
