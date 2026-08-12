import { useMemo, useSyncExternalStore } from 'react'

/** Custom event fired after pushState/replaceState (popstate doesn't cover it). */
const NAV_EVENT = 'montflow:navigate'

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAV_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAV_EVENT, onChange)
  }
}

const getSnapshot = (): string => location.pathname + location.search

const update = (path: string, replace: boolean): void => {
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(NAV_EVENT))
}

/** SPA navigation that keeps the browser history working (back/forward). */
export const navigate = (path: string): void => update(path, false)

/** Subscribe to the current URL (pathname + query string). */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Current pathname only (query string stripped) — for route matching. */
export function usePathname(): string {
  const location = useLocation()
  return location.split('?')[0] ?? ''
}

/** Current query string as parsed params (re-renders on every URL change). */
export function useSearchParams(): URLSearchParams {
  const location = useLocation()
  return useMemo(() => new URLSearchParams(location.split('?')[1] ?? ''), [location])
}

/** Replace the query string on the current path (no history entry — the
 *  back button shouldn't walk through every filter change). */
export const setSearchParams = (params: URLSearchParams): void => {
  const search = params.toString()
  update(`${location.pathname}${search === '' ? '' : `?${search}`}`, true)
}
