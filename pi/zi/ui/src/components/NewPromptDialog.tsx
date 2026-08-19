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
import { useSavePrompt } from '@/lib/usePrompts'
import { ArrowUpRight, Loader2 } from 'lucide-react'

interface NewPromptDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after creation — carries the created prompt name for navigation. */
  onCreated: (name: string) => void
}

/**
 * Minimal prompt creation: name + optional description + a starter template.
 * The created prompt opens on its detail page, where variables are defined
 * and placed (`{{name}}`) in the template.
 */
export function NewPromptDialog({ workspaceId, open, onOpenChange, onCreated }: NewPromptDialogProps) {
  const savePrompt = useSavePrompt(workspaceId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setName('')
    setDescription('')
    setTemplate('')
    setError(null)
  }

  // Re-arm the dialog each time it opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const create = (): void => {
    if (name.trim() === '') return
    savePrompt.mutate(
      {
        name: name.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
        template,
        variables: [],
      },
      {
        onSuccess: ({ name: createdName }) => {
          onCreated(createdName)
          onOpenChange(false)
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create prompt'),
      },
    )
  }

  const close = (): void => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New prompt</DialogTitle>
          <DialogDescription>
            Create the prompt, then define its variables on its page. Opening a placeholder like{' '}
            <code className="rounded bg-muted px-1">{'{{files}}'}</code> in the template makes it a
            prompt you fill in each time you run it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prompt-name" className="text-xs font-medium text-muted-foreground">
              Name (kebab-case)
            </label>
            <Input
              id="prompt-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
              placeholder="code-review"
              className="font-mono"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prompt-description" className="text-xs font-medium text-muted-foreground">
              Description <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              id="prompt-description"
              autoComplete="off"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this prompt does"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="prompt-template" className="text-xs font-medium text-muted-foreground">
              Template <span className="text-muted-foreground/60">(add variables later)</span>
            </label>
            <textarea
              id="prompt-template"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              spellCheck={false}
              placeholder="Audit these files for security issues:&#10;{{files}}"
              className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent p-2.5 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          {error !== null && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="flex-col items-start gap-2">
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={create} disabled={savePrompt.isPending || name.trim() === ''}>
              {savePrompt.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create
                  <ArrowUpRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
