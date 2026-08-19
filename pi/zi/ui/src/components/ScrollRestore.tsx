import { useLayoutEffect, useRef } from 'react'
import { useLocation } from '@/lib/useLocation'
import { consumeSkipRestore, markRestored, savedScroll } from '@/lib/scrollRestoration'

/**
 * Replays the saved scroll position after SPA navigation (breadcrumbs,
 * back/forward). Rendered once per layout in App; its layout effect runs
 * after the new page is committed but before paint, so the restored position
 * is in place before anything is shown.
 *
 * When the pathname changes to a page with no saved position (e.g. switching
 * between two workspaces), the reused scroll container would otherwise keep
 * the old page's scroll — reset to the top instead.
 */
export function ScrollRestore() {
  const location = useLocation()
  const pathname = location.split('?')[0] ?? ''
  const prevPathname = useRef(pathname)

  useLayoutEffect(() => {
    const el = document.querySelector('[data-scroll-region]')
    if (el === null) return
    if (consumeSkipRestore()) {
      // A section deep link is about to smooth-scroll — don't replay a stale
      // saved position underneath it.
      el.scrollTop = 0
      prevPathname.current = pathname
      return
    }
    const saved = savedScroll(location)
    if (saved !== undefined) {
      el.scrollTop = saved
      markRestored(location)
    } else if (prevPathname.current !== pathname) {
      el.scrollTop = 0
    }
    prevPathname.current = pathname
  }, [location, pathname])

  return null
}
