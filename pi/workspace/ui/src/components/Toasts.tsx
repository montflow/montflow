import type { Toast } from '@/protocol'
import { AlertCircle, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const iconFor = (level: Toast['level']) => {
  switch (level) {
    case 'error':
      return <AlertCircle className="size-4 text-red-500" />
    case 'warning':
      return <TriangleAlert className="size-4 text-amber-500" />
    default:
      return <Info className="size-4 text-sky-500" />
  }
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg',
            toast.level === 'error' && 'border-red-500/40',
            toast.level === 'warning' && 'border-amber-500/40',
          )}
        >
          {iconFor(toast.level)}
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
