import type { ReactNode } from 'react'

interface TableEmptyStateProps {
  /** Optional icon rendered above the message (pass a sized lucide icon). */
  icon?: ReactNode
  /** Primary centered message. */
  message: string
  /** Optional secondary hint line. */
  hint?: string
}

/**
 * Centered empty-state block rendered inside a section's fixed-height table
 * container — used both when the section has no items at all and when
 * filters match nothing, so every workspace section looks the same when
 * empty.
 */
export function TableEmptyState({ icon, message, hint }: TableEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-xs text-muted-foreground">
      {icon !== undefined && icon}
      <p>{message}</p>
      {hint !== undefined && <p className="text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
