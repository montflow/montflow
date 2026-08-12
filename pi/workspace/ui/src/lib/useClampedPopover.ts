import { useEffect, useRef, useState } from 'react'

/** Gap between the trigger and the panel (matches `mt-1.5`/`mb-1.5`). */
const GAP = 6

/**
 * Positioning for a dropdown panel that must never clip off the viewport.
 * The header's left-side dropdowns (model picker, runs) used to be `right-0`
 * anchored, which made the panel grow leftward from a button near the screen
 * edge — clipping off-screen. This anchors the panel's left edge to the
 * trigger's left edge and clamps it inside the viewport, re-clamping on
 * window resize while open.
 *
 * When `height` is given (estimated panel height in px), the hook also
 * decides the vertical direction: panels inside centered dialogs can run out
 * of room below, so it reports `openUp` — render the panel with
 * `bottom-full mb-1.5` instead of `mt-1.5` when there isn't enough space
 * below but there is above.
 *
 * @param open whether the panel is currently shown (drives (re)positioning)
 * @param width the panel's width in px (must match its Tailwind `w-*` class);
 *   0 skips horizontal clamping (e.g. panels spanning the trigger width)
 * @param height estimated panel height in px; 0 disables vertical logic
 * @param margin minimum distance from the viewport edges, px
 */
export function useClampedPopover(open: boolean, width: number, height = 0, margin = 8) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [panelLeft, setPanelLeft] = useState(0)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    if (!open) return
    const position = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(
        margin,
        Math.min(rect.left, window.innerWidth - width - margin),
      )
      setPanelLeft(left - rect.left)
      if (height > 0) {
        const below = window.innerHeight - rect.bottom - GAP
        const above = rect.top - GAP
        setOpenUp(below < height && above > below)
      }
    }
    position()
    window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [open, width, height, margin])

  return { triggerRef, panelLeft, openUp }
}
