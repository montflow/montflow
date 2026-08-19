import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BuiltinReviewerInfo, PresetConfig, PresetSummary, PresetType } from '../protocol'

const fetchPresets = async (target: string): Promise<PresetSummary[]> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/presets`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { presets?: PresetSummary[] }
  return data.presets ?? []
}

/**
 * Fetches the review-preset list for a workspace from the router via
 * react-query. Returns the standard UseQueryResult so callers can
 * distinguish the initial pending state, background refetches, and errors.
 */
export function usePresets(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['presets', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchPresets(workspaceId)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    // Cheap polling fallback — catches presets written by agents editing
    // files directly (those bypass the router's presetChanged broadcast).
    refetchInterval: 30_000,
  })
}

/**
 * One preset's detail, selected from the (shared) list query so a single
 * cache entry covers both the list and every detail page. Invalid presets
 * surface with their `error` field set — the detail page renders it.
 */
export function usePresetDetail(
  workspaceId: string | null,
  presetName: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  const { data: presets, ...rest } = usePresets(workspaceId, conn)
  const preset = useMemo(
    () =>
      presetName === null
        ? null
        : (presets ?? []).find((p) => p.name === presetName) ?? null,
    [presets, presetName],
  )
  return { ...rest, data: preset }
}

/**
 * Creates or overwrites a preset (manual mode) — POSTs `{ type, config }` to
 * the preset's file URL and invalidates the workspace's preset list on
 * success. The router validates the payload against the preset schema.
 */
export function useCreatePreset(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      config,
      type,
    }: {
      name: string
      config: PresetConfig
      type: PresetType
    }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/presets/${encodeURIComponent(name)}.json`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Version 1 is the only preset format today — the router refuses
          // versionless writes, so the stored JSONs always carry it.
          body: JSON.stringify({ version: 1, type, config }),
        },
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
      return { name }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presets', workspaceId] })
    },
  })
}

/**
 * Deletes a preset file (DELETE .../presets/<name>.json) and invalidates
 * the workspace's preset list on success.
 */
export function useDeletePreset(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/presets/${encodeURIComponent(name)}.json`,
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
      void queryClient.invalidateQueries({ queryKey: ['presets', workspaceId] })
    },
  })
}

/**
 * Fetches the builtin reviewer catalog (id → label) — used to render
 * `builtin` reviewer references in preset tables and detail pages.
 */
export function useBuiltinReviewers(conn: 'connecting' | 'open' | 'closed') {
  return useQuery({
    queryKey: ['reviewers'],
    queryFn: async () => {
      const res = await fetch('/api/reviewers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { builtins?: BuiltinReviewerInfo[] }
      return data.builtins ?? []
    },
    enabled: conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
