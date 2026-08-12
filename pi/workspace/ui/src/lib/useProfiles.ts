import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileDetail, ProfileSummary } from '../protocol'

const fetchProfiles = async (target: string): Promise<ProfileSummary[]> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/profiles`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { profiles?: ProfileSummary[] }
  return data.profiles ?? []
}

const fetchProfileDetail = async (target: string, profileName: string): Promise<ProfileDetail> => {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(target)}/profiles/${encodeURIComponent(profileName)}`,
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { profile?: ProfileDetail }
  if (data.profile === undefined) throw new Error('Profile not found')
  return data.profile
}

/**
 * Fetches the profile list for a workspace from the router via react-query.
 * Returns the standard UseQueryResult so callers can distinguish the
 * initial pending state, background refetches, and errors.
 */
export function useProfiles(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['profiles', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchProfiles(workspaceId)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Creates a profile (manual mode) — POSTs { name, markdown } and invalidates
 * the workspace's profile list on success.
 */
export function useCreateProfile(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, markdown }: { name: string; markdown: string }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, markdown }),
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: string }
          if (typeof data.error === 'string') message = data.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      const data = (await res.json()) as { profile?: ProfileDetail }
      if (data.profile === undefined) throw new Error('Profile not created')
      return data.profile
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles', workspaceId] })
    },
  })
}

/**
 * Deletes a profile (removes its `.agents/@montflow/profiles/<name>/`
 * directory) and invalidates the workspace's profile list on success.
 */
export function useDeleteProfile(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/profiles/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: string }
          if (typeof data.error === 'string') message = data.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles', workspaceId] })
    },
  })
}

/**
 * Fetches one profile's full parsed PROFILE.md by its directory name.
 */
export function useProfileDetail(
  workspaceId: string | null,
  profileName: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['profiles', workspaceId, profileName],
    queryFn: async () => {
      if (workspaceId === null || profileName === null) throw new Error('No profile selected')
      return fetchProfileDetail(workspaceId, profileName)
    },
    enabled: workspaceId !== null && profileName !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}