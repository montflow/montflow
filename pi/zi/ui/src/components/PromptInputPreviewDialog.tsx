import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePromptInputPreview } from '@/lib/usePrompts'
import type { PromptVariable } from '@/protocol'
import { Check, Copy, Eye, Loader2, RotateCcw } from 'lucide-react'

interface PromptInputPreviewDialogProps {
  workspaceId: string
  promptName: string
  /** Current editor-draft template (unsaved changes included). */
  template: string
  variables: PromptVariable[]
  skills: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * \"View input\" preview — shows the EXACT text that would be handed to the
 * agent when the prompt runs. Built server-side from the current editor
 * draft with the same combos the run executor uses (skills loaded from disk,
 * wrapPromptPrompt wrappers, PROMPT_RUNNER_SYSTEM). Rendered with each
 * variable's default; tokens without a default stay as placeholders (the run
 * dialog prompts for those).
 */
export function PromptInputPreviewDialog({
  workspaceId,
  promptName,
  template,
  variables,
  skills,
  open,
  onOpenChange,
}: PromptInputPreviewDialogProps) {
  const preview = usePromptInputPreview(workspaceId)
  const [copied, setCopied] = useState(false)

  // Re-fetch on every open so the preview always reflects the latest draft.
  useEffect(() => {
    if (!open) return
    preview.reset()
    preview.mutate({ name: promptName, template, variables, skills })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promptName])

  const copy = async (): Promise<void> => {
    const text = preview.data?.task ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API unavailable (permissions / http) — fall back to a
      // hidden textarea selection copy.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" />
            Agent input preview
          </DialogTitle>
          <DialogDescription>
            This is exactly what the agent receives when you run this prompt — rendered with each
            variable's default value. Tokens without a default stay as placeholders and are
            prompted for at run time.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p>Building agent input…</p>
          </div>
        ) : preview.isError ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-500">
            <p className="truncate">
              {preview.error instanceof Error ? preview.error.message : String(preview.error)}
            </p>
            <Button size="xs" variant="outline" onClick={() => preview.mutate({ name: promptName, template, variables, skills })}>
              <RotateCcw className="size-3" />
              Retry
            </Button>
          </div>
        ) : preview.data !== undefined ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Task — the prompt text handed to the agent
                {preview.data.skills.length > 0 && (
                  <span className="ml-2 rounded-full bg-violet-500/10 px-1.5 py-px text-[10px] font-medium text-violet-600 dark:text-violet-300">
                    {preview.data.skills.length} skill{preview.data.skills.length === 1 ? '' : 's'} loaded
                  </span>
                )}
              </p>
              <Button size="xs" variant="outline" onClick={() => void copy()} title="Copy the full input">
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {preview.data.task}
            </pre>

            {preview.data.unfilled.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Unfilled variables (prompted for at run time):{' '}
                {preview.data.unfilled.map((token) => (
                  <code key={token} className="rounded bg-muted px-1">
                    {'{{'}{token}{'}'}
                  </code>
                ))}
              </p>
            )}

            <details className="rounded-md border">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
                System prompt + tools
              </summary>
              <div className="border-t px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  Tools: <code className="rounded bg-muted px-1 font-mono">{preview.data.tools.join(', ')}</code>
                </p>
                <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
                  {preview.data.system}
                </pre>
              </div>
            </details>
          </div>
        ) : null}

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}