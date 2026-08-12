/**
 * SPA scroll restoration.
 *
 * The app is a fixed `h-dvh` layout where each page scrolls inside its own
 * container (marked `data-scroll-region`) — the window never scrolls, so the
 * browser's native scroll restoration can't help. Instead we snapshot each
 * page's scroll position before every URL change (see useLocation) and replay
 * it once the target page has laid out (see ScrollRestore).
 *
 * Positions are keyed by the full URL (pathname + query string) so a page
 * visited with filters (e.g. ?rs=done) comes back with the same filters and
 * the same scroll.
 */

/** Primary scrollable element of the current page. */
const scroller = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-scroll-region]')

const positions = new Map<string, number>()

/** The URL of the page currently on screen — where saves are attributed. */
let currentPath = location.pathname + location.search

/** URL of the most recent restore (consumed once by auto-pinning pages). */
let restoredPath: string | null = null

/** Set when a section deep link is about to scroll — skip the next restore. */
let skipRestore = false

// Our own restoration handles everything; stop the browser from trying.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

/** Snapshot the on-screen page's scroll, keyed by the URL being left. */
export const saveScroll = (): void => {
  const el = scroller()
  if (el !== null) positions.set(currentPath, el.scrollTop)
}

/** Record that the URL is changing; `next` defaults to the live location. */
export const setCurrentPath = (next: string = location.pathname + location.search): void => {
  currentPath = next
}

/** Saved scroll for a URL, or undefined if never visited. */
export const savedScroll = (path: string): number | undefined => positions.get(path)

/** Mark that `path`'s scroll was just restored. */
export const markRestored = (path: string): void => {
  restoredPath = path
}

/**
 * One-shot check: did the most recent restore target `path`? Pages that
 * auto-pin to the bottom (sessions, runs) use this to not fight the restored
 * position. Always clears the flag.
 */
export const consumeRestored = (path: string): boolean => {
  if (restoredPath !== path) return false
  restoredPath = null
  return true
}

/**
 * A section deep link (e.g. a breadcrumb's `?section=skills`) is about to
 * scroll to a specific element — tell ScrollRestore to skip replaying any
 * saved position so the two don't fight.
 */
export const skipNextRestore = (): void => {
  skipRestore = true
}

/** One-shot: was a skip requested? Always clears the flag. */
export const consumeSkipRestore = (): boolean => {
  const pending = skipRestore
  skipRestore = false
  return pending
}
