import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceInfoDetail } from '../protocol'

/** Fetches router-computed git info (folder, repo, branch, path) for a workspace. */
export function useWorkspaceInfo(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
): WorkspaceInfoDetail | null {
  const [info, setInfo] = useState<WorkspaceInfoDetail | null>(null)

  const load = useCallback(async (target: string) => {
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/info`)
      if (!res.ok) return
      const data = (await res.json()) as WorkspaceInfoDetail
      setInfo(data)
    } catch {
      // keep last known info; retry on next reconnect
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return
    setInfo(null)
    void load(workspaceId)
  }, [workspaceId, conn, load])

  return info
}
