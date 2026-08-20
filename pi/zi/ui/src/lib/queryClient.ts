import { QueryClient } from '@tanstack/react-query'

/**
 * Shared QueryClient for the app. The UI-socket controller (module-level
 * singleton) needs to invalidate react-query caches when the backend
 * mutates workspace data (skills/profiles/presets/prompts), so the client
 * must be shared between main.tsx and the controller — not created per-hook.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
