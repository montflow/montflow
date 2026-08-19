import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { Info } from 'lucide-react'

/**
 * Small "i" badge with a hover tooltip — used next to form labels to explain
 * a field in more depth without cluttering the UI.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label="More info"
            className="cursor-help rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Info className="size-3.5" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            className="z-50 max-w-64 rounded-md border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md"
          >
            {text}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
