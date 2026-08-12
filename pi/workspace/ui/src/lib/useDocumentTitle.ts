import { useEffect } from 'react'

/** Bare app title used when no route-specific page is active. */
export const APP_TITLE = 'Montflow'

/**
 * Keeps `document.title` (the browser tab) in sync with the current page.
 * Pass `null` to fall back to the bare app title.
 */
export function useDocumentTitle(page: string | null): void {
  useEffect(() => {
    document.title = page === null || page === '' ? APP_TITLE : `${page} — ${APP_TITLE}`
  }, [page])
}
