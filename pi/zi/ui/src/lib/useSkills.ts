import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkillDetail, SkillSummary } from '../protocol'

const fetchSkills = async (target: string): Promise<SkillSummary[]> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/skills`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { skills?: SkillSummary[] }
  return data.skills ?? []
}

const fetchSkillDetail = async (target: string, skillId: string): Promise<SkillDetail> => {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(target)}/skills/${encodeURIComponent(skillId)}`,
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { skill?: SkillDetail }
  if (data.skill === undefined) throw new Error('Skill not found')
  return data.skill
}

/**
 * Fetches the skill list for a workspace from the router via react-query.
 * Returns the standard UseQueryResult so callers can distinguish the
 * initial pending state, background refetches, and errors.
 */
export function useSkills(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['skills', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchSkills(workspaceId)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    // Cheap polling fallback — catches skills created by agents writing
    // files directly (those bypass the router's skillChanged broadcast).
    refetchInterval: 30_000,
  })
}

/**
 * Fetches one skill's full SKILL.md by its directory slug.
 */
export function useSkillDetail(
  workspaceId: string | null,
  skillId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['skills', workspaceId, skillId],
    queryFn: async () => {
      if (workspaceId === null || skillId === null) throw new Error('No skill selected')
      return fetchSkillDetail(workspaceId, skillId)
    },
    enabled: workspaceId !== null && skillId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Maps skill names (frontmatter `name:`) and directory slugs to the
 * directory slug, so profile-referenced skills (stored by name) can link
 * to the skill detail route (keyed by directory slug).
 */
export function useSkillNameToIdMap(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
): Map<string, string> {
  const { data: skills } = useSkills(workspaceId, conn)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const skill of skills ?? []) {
      map.set(skill.name, skill.id)
      map.set(skill.id, skill.id)
    }
    return map
  }, [skills])
}

/**
 * Creates a skill (manual mode) — POSTs { name, markdown } and invalidates
 * the workspace's skill list on success.
 */
export function useCreateSkill(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, markdown }: { name: string; markdown: string }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/skills`, {
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
      const data = (await res.json()) as { skill?: SkillDetail }
      if (data.skill === undefined) throw new Error('Skill not created')
      return data.skill
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['skills', workspaceId] })
    },
  })
}
