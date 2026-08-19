import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  /** Scroll-target id (e.g. for the command palette). */
  id?: string
  title: string
  icon?: ReactNode
  defaultOpen?: boolean
  /** Controlled open state (e.g. persisted per workspace). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

/** A titled section that can be collapsed/expanded like a drawer. */
export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = openProp ?? internalOpen

  const toggle = (): void => {
    if (onOpenChange !== undefined) onOpenChange(!open)
    else setInternalOpen((prev) => !prev)
  }

  return (
    <section id={id} className="mt-6 scroll-mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group mb-3 flex w-full items-center gap-2 rounded-md bg-foreground/5 px-3 py-2 text-lg font-semibold text-foreground transition-colors hover:bg-foreground/10"
      >
        {icon}
        <span>{title}</span>
        <ChevronDown
          className={`ml-auto size-5 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && children}
    </section>
  )
}
