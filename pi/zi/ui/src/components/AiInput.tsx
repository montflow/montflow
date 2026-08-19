import { useEffect, useId, useRef, useState } from 'react'
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
import { useModels } from '@/lib/useModels'
import { useUiSocket } from '@/lib/useUiSocket'
import { cn } from '@/lib/utils'
import { Loader2, Sparkles } from 'lucide-react'

interface AiInputProps extends Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  /** Folder slug for agentic commands; null when the workspace is offline. */
  folder: string | null
  /**
   * Pre-populated prompt shown in the modal every time it opens (the user
   * can edit it before generating). Omit for an empty prompt.
   */
  prompt?: string
  /**
   * Optional label rendered in the same row as the AI button, above the
   * field (e.g. "Prompt"). Omit for a bare button row.
   */
  label?: string
}

/**
 * Textarea with an "AI generate" button pinned to its top-right corner. The
 * button opens a modal with a prompt input (optionally pre-filled via the
 * `prompt` prop) + model selector; the agent's answer streams live into the
 * modal and, once it finishes, is written back into the textarea via
 * `onChange`.
 *
 * This is a one-shot prompt answer — NOT a run: nothing is persisted, no
 * notifications fire, and nothing shows up on the Runs page. While the agent
 * works the modal is locked (no close, no exit); on error it unlocks with a
 * Retry.
 */
export function AiInput({ value, onChange, folder, prompt, label, className, disabled, ...props }: AiInputProps) {
  const { sendCommand, conn, textGens } = useUiSocket()
  const modelsQuery = useModels(conn)
  const inputId = useId()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [genId, setGenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const outputRef = useRef<HTMLPreElement | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  // Guards the few-ms window between clicking Generate and the first textGen
  // event materializing `gen` (the modal is only locked once `gen` exists).
  const submittingRef = useRef(false)

  const gen = genId !== null ? textGens[genId] : undefined
  const running = gen?.status === 'running'
  const output = gen?.text ?? ''

  // Opening the modal arms everything up front — draft (with the prefill)
  // commits in the SAME render as `open`, so the prompt textarea mounts with
  // its final value and the caret can be placed at the end below.
  const openModal = (): void => {
    setDraft(prompt ?? '')
    setModel(modelsQuery.data?.selected ?? null)
    setGenId(null)
    setError(null)
    setApplied(false)
    submittingRef.current = false
    setOpen(true)
  }

  // Place the caret at the END of the pre-filled prompt (browsers put it at
  // the start on focus). Runs once per open, after the textarea has its value.
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      const el = promptRef.current
      if (el !== null) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  // The start event arrived — the working view (locked modal) takes over.
  useEffect(() => {
    if (gen !== undefined) submittingRef.current = false
  }, [gen])

  // Auto-scroll the live output pane.
  useEffect(() => {
    const el = outputRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [output, running])

  // Terminal states: fill the input on success, unlock with an error otherwise.
  useEffect(() => {
    if (gen === undefined || applied) return
    if (gen.status === 'done') {
      const text = gen.text.trim()
      if (text !== '') {
        onChange(text)
        setApplied(true)
        setOpen(false)
      }
    } else if (gen.status === 'error') {
      setError(gen.text.trim() || 'The agent could not produce an answer.')
    }
  }, [gen, applied, onChange])

  // If the connection drops mid-generation, unlock (back to the form) with
  // an error instead of hanging the locked modal forever.
  useEffect(() => {
    if (running && conn === 'closed') {
      setGenId(null)
      setError('Connection lost while generating — nothing was applied.')
      submittingRef.current = false
    }
  }, [running, conn])

  const close = (): void => {
    setOpen(false)
    setGenId(null)
    submittingRef.current = false
  }

  const generate = (): void => {
    if (submittingRef.current || draft.trim() === '' || folder === null) return
    submittingRef.current = true
    const id = crypto.randomUUID()
    setGenId(id)
    setError(null)
    setApplied(false)
    sendCommand(folder, { type: 'textGenerate', runId: id, text: draft.trim(), model: model ?? undefined })
  }

  const retry = (): void => {
    setGenId(null)
    setError(null)
    submittingRef.current = false
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        {label !== undefined && (
          <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
            {label}
          </label>
        )}
        <button
          type="button"
          onClick={openModal}
          disabled={disabled || value.trim() !== ''}
          title={
            value.trim() !== ''
              ? 'The field already has content — clear it to use AI generation'
              : 'Generate with AI'
          }
          aria-label="Generate with AI"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Sparkles className="size-3.5" />
          AI
        </button>
      </div>
      <textarea
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn(
          'w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />

      <Dialog open={open} onOpenChange={(next) => (next ? openModal() : close())}>
        <DialogContent
          className="sm:max-w-xl"
          showCloseButton={!running}
          // The modal is locked while the agent works — no exit.
          onEscapeKeyDown={(event) => {
            if (running) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (running) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Generate with AI</DialogTitle>
            <DialogDescription>
              Describe what you want — an agent answers in a single pass and the result is
              inserted into the field.
            </DialogDescription>
          </DialogHeader>

          {gen === undefined ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ai-prompt" className="text-xs font-medium text-muted-foreground">
                  Prompt
                </label>
                <textarea
                  id="ai-prompt"
                  ref={promptRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                {folder === null && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Workspace not connected — AI generation needs a running /montflow session.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ai-model" className="text-xs font-medium text-muted-foreground">
                  Model
                </label>
                <ModelSelect conn={conn} value={model} onChange={setModel} />
              </div>
              {error !== null && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Output</span>
                {running && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Working…
                  </span>
                )}
              </div>
              <pre
                ref={outputRef}
                className="max-h-64 min-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground"
              >
                {output === '' ? '…' : output}
              </pre>
              {error !== null && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}

          <DialogFooter>
            {gen === undefined ? (
              <>
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={generate} disabled={draft.trim() === '' || folder === null || submittingRef.current}>
                  <Sparkles className="size-3.5" />
                  Generate
                </Button>
              </>
            ) : running ? (
              <div className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Working…
              </div>
            ) : gen.status === 'done' ? (
              // Applied and closed by the terminal-state effect.
              <div className="flex w-full items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <Loader2 className="size-4 animate-spin" />
                Applied
              </div>
            ) : (
              <>
                <Button variant="outline" onClick={close}>
                  Close
                </Button>
                <Button variant="outline" onClick={retry}>
                  Retry
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
