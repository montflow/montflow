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
 * Minimal prompt creation: just a name. On submit the prompt opens on its
 * detail page in edit mode — where you declare variables (right panel) and
 * build the template (left panel, with {{ }} highlighting + autocomplete).
 */
export function NewPromptDialog({ workspaceId, open, onOpenChange, onCreated }: NewPromptDialogProps) {
  const savePrompt = useSavePrompt(workspaceId)

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = (): void => {
    setName('')
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
        template: '',
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

  // Esc only closes a clean dialog — never drop typed content.
  const dirty = name.trim() !== ''

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? reset() : close())}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (dirty) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>New prompt</DialogTitle>
          <DialogDescription>
            Name it, then give it shape on its page — declare variables and write the template.
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
