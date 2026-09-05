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
import { useCreateSpec } from '@/lib/useSpecs'
import { ArrowUpRight, Loader2 } from 'lucide-react'

interface NewSpecDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after creation — carries the created spec name for navigation. */
  onCreated: (name: string) => void
}

/**
 * Minimal spec creation: kebab-case name + "Create". The router stamps
 * spec.md from the template (draft status, empty bookkeeping model); the
 * created spec opens on its detail page where phases, tasks, and the scope
 * prompt are authored.
 */
export function NewSpecDialog({ workspaceId, open, onOpenChange, onCreated }: NewSpecDialogProps) {
  const createSpec = useCreateSpec(workspaceId)

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

  const invalid = name.trim() !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.trim())

  const create = (): void => {
    const trimmed = name.trim()
    if (trimmed === '' || invalid) return
    createSpec.mutate(
      { name: trimmed },
      {
        onSuccess: ({ name: createdName }) => {
          onCreated(createdName)
          onOpenChange(false)
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create spec'),
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
          <DialogTitle>New spec</DialogTitle>
          <DialogDescription>
            Creates an empty spec under <span className="font-mono">.agents/@montflow/specs/</span>{' '}
            — draft status, no phases yet. Author it by hand on the detail page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="spec-name" className="text-xs font-medium text-muted-foreground">
              Name (kebab-case)
            </label>
            <Input
              id="spec-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create()
              }}
              placeholder="auth-rework"
              className={`font-mono ${invalid ? 'border-red-500' : ''}`}
              autoFocus
            />
            {invalid && (
              <p className="text-[11px] text-red-500">
                Lowercase letters, digits, and hyphens only (e.g. auth-rework).
              </p>
            )}
          </div>
          {error !== null && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="flex-col items-start gap-2">
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={create} disabled={createDisabled(createSpec.isPending, name.trim(), invalid)}>
              {createSpec.isPending ? (
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

const createDisabled = (pending: boolean, name: string, invalid: boolean): boolean =>
  pending || name === '' || invalid
