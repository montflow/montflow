import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkspaceInfo } from '../protocol'

const fetchWorkspaces = async (): Promise<WorkspaceInfo[]> => {
  const res = await fetch('/api/workspaces')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { workspaces?: WorkspaceInfo[] }
  return data.workspaces ?? []
}

/** Remove a workspace from the home list (router-side DELETE). */
export const removeWorkspace = async (workspaceId: string): Promise<void> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/**
 * The persisted workspace list from the router (react-query backed so any
 * mutation — like removing a workspace — can invalidate the cache). Refetches
 * when the connected folder set changes (new projects register workspaces).
 */
export function useWorkspaces(
  conn: 'connecting' | 'open' | 'closed',
  folders: ReadonlyArray<{ id: string }>,
): WorkspaceInfo[] | null {
  const queryClient = useQueryClient()
  const foldersKey = folders.map((f) => f.id).join(',')

  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    enabled: conn === 'open',
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // A change in the connected folders can mean a workspace registered or
  // disconnected — refresh the list.
  useEffect(() => {
    if (conn === 'open') void queryClient.invalidateQueries({ queryKey: ['workspaces'] })
  }, [foldersKey, conn, queryClient])

  return query.data ?? null
}
