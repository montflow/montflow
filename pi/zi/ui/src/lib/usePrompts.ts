import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PromptSummary, PromptVariable } from '../protocol'

/** How long a save/delete request may take before we surface a timeout error. */
const REQUEST_TIMEOUT_MS = 20_000

interface ApiError {
  error?: string
}

/**
 * fetch + JSON-parse with a client-side timeout. Without this a request to a
 * dead router hangs forever (Save spinning forever); with it we surface a
 * clear error. Typed `{ error }` bodies from the server are extracted too.
 */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'The request timed out — is the /zi UI router running? Make sure /zi is up, then try again.',
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
  // Read the body even on error so a typed `{ error }` message gets surfaced.
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const message =
      body !== null && typeof (body as ApiError).error === 'string'
        ? ((body as ApiError).error as string)
        : `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

const fetchPrompts = async (target: string): Promise<PromptSummary[]> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/prompts`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { prompts?: PromptSummary[] }
  return data.prompts ?? []
}

/**
 * Fetches the prompt list for a workspace from the router via react-query.
 * Returns the standard UseQueryResult so callers can distinguish the initial
 * pending state, background refetches, and errors.
 */
export function usePrompts(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['prompts', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchPrompts(workspaceId)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    // Cheap polling fallback — catches prompts written by agents editing
    // files directly (those bypass the router's promptChanged broadcast).
    refetchInterval: 30_000,
  })
}

/**
 * One prompt's detail, selected from the (shared) list query so a single
 * cache entry covers both the list and every detail page. Invalid prompts
 * surface with their `error` field set — the detail page renders it.
 */
export function usePromptDetail(
  workspaceId: string | null,
  promptName: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  const { data: prompts, ...rest } = usePrompts(workspaceId, conn)
  const prompt = useMemo(
    () =>
      promptName === null
        ? null
        : (prompts ?? []).find((p) => p.name === promptName) ?? null,
    [prompts, promptName],
  )
  return { ...rest, data: prompt }
}

/** Payload for saving a prompt (create or overwrite). */
export interface PromptDraft {
  name: string
  description?: string
  template: string
  variables: PromptVariable[]
  /** Workspace skills (by SKILL.md frontmatter name) loaded into the run's context. */
  skills?: string[]
}

/**
 * Creates or overwrites a prompt — POSTs the versioned prompt shape to the
 * prompt's file URL and invalidates the workspace's prompt list on success.
 * The router validates the payload against the prompt schema and rejects
 * unknown versions.
 */
export function useSavePrompt(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (draft: PromptDraft) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      await requestJson<{ ok?: boolean; name?: string }>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/prompts/${encodeURIComponent(draft.name)}.json`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            version: 1,
            description: draft.description,
            template: draft.template,
            variables: draft.variables,
            skills: draft.skills,
          }),
        },
      )
      return { name: draft.name }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prompts', workspaceId] })
    },
  })
}

/**
 * Deletes a prompt file (DELETE .../prompts/<name>.json) and invalidates the
 * workspace's prompt list on success.
 */
export function useDeletePrompt(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      await requestJson<{ ok?: boolean }>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/prompts/${encodeURIComponent(name)}.json`,
        { method: 'DELETE' },
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prompts', workspaceId] })
    },
  })
}
