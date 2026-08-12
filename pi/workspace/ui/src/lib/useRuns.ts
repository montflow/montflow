import { useQuery } from '@tanstack/react-query'
import type { RunSummary } from '../protocol'

const RUN_STATUSES = ['running', 'done', 'awaiting', 'interrupted', 'error'] as const
export type RunStatusFilter = (typeof RUN_STATUSES)[number]

/** All statuses, in display order — used for filter chips. */
export const ALL_RUN_STATUSES: readonly RunStatusFilter[] = RUN_STATUSES

const fetchRuns = async (
  target: string,
  status: readonly RunStatusFilter[],
): Promise<RunSummary[]> => {
  const params = new URLSearchParams({ workspace: target })
  if (status.length > 0) params.set('status', status.join(','))
  const res = await fetch(`/api/runs?${params.toString()}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { runs?: RunSummary[] }
  return data.runs ?? []
}

/**
 * Fetches the workspace's agentic runs (durable router snapshots) with
 * status filtering via react-query. Polls — runs change as agents stream.
 */
export function useRuns(
  workspaceId: string | null,
  status: readonly RunStatusFilter[],
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['runs', workspaceId, status.join(',')],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchRuns(workspaceId, status)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
