import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/** A titled section that can be collapsed/expanded like a drawer. */
export function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="group mb-3 flex w-full items-center gap-2 rounded-md bg-muted px-3 py-2 text-lg font-semibold text-foreground transition-colors hover:bg-accent"
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
