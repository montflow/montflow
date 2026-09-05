import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpecDetailInfo, SpecSummary } from '../protocol'

const fetchSpecs = async (target: string): Promise<SpecSummary[]> => {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(target)}/specs`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { specs?: SpecSummary[] }
  return data.specs ?? []
}

/**
 * Fetches the feature-spec list for a workspace from the router via
 * react-query. Returns the standard UseQueryResult so callers can
 * distinguish the initial pending state, background refetches, and errors.
 */
export function useSpecs(workspaceId: string | null, conn: 'connecting' | 'open' | 'closed') {
  return useQuery({
    queryKey: ['specs', workspaceId],
    queryFn: async () => {
      if (workspaceId === null) throw new Error('No workspace selected')
      return fetchSpecs(workspaceId)
    },
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    // Cheap polling fallback — catches specs written by agents editing
    // files directly.
    refetchInterval: 30_000,
  })
}

/**
 * Fetches one spec's full detail tree (phases → tasks) via
 * GET /specs/<name>. Polled — the bookkeeping agent rewrites task/spec
 * frontmatter as work progresses, and the graph + cards should follow
 * without a manual reload.
 */
export function useSpecDetail(
  workspaceId: string | null,
  specName: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['spec-detail', workspaceId, specName],
    queryFn: async () => {
      if (workspaceId === null || specName === null) throw new Error('No spec selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(specName)}`,
      )
      if (!res.ok) throw new Error(await errorMessage(res))
      const data = (await res.json()) as { spec?: SpecDetailInfo }
      if (data.spec === undefined) throw new Error('Spec not found')
      return data.spec
    },
    enabled: workspaceId !== null && specName !== null && conn !== 'closed',
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
    refetchInterval: 20_000,
  })
}

/** Extracts the router's error message from a failed response body. */
const errorMessage = async (res: Response): Promise<string> => {
  let message = `HTTP ${res.status}`
  try {
    const data = (await res.json()) as { error?: string }
    if (typeof data.error === 'string') message = data.error
  } catch {
    // non-JSON error body
  }
  return message
}

/**
 * Creates a spec (POST /specs { name }) — the router stamps spec.md from
 * the template — and invalidates the workspace's spec list on success.
 */
export function useCreateSpec(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/specs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      const data = (await res.json()) as { spec?: SpecSummary }
      return { name: data.spec?.name ?? name }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['specs', workspaceId] })
    },
  })
}

/** Deletes a spec tree (DELETE .../specs/<name>) and invalidates the list. */
export function useDeleteSpec(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(await errorMessage(res))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['specs', workspaceId] })
    },
  })
}

/**
 * Writes raw markdown to the spec's spec.md (PUT .../spec-md). Used by the
 * Begin modal to persist the described feature as the scope prompt before
 * launching the kickoff agent. Fallback-model pickers and extra guidance
 * are deferred UI (backend already accepts bookkeepingModel / guidance).
 */
export function useSetScopePrompt(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, markdown }: { name: string; markdown: string }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(name)}/spec-md`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ markdown }),
        },
      )
      if (!res.ok) throw new Error(await errorMessage(res))
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['spec-detail', workspaceId, variables.name] })
      void queryClient.invalidateQueries({ queryKey: ['specs', workspaceId] })
    },
  })
}

/**
 * Starts the spec kickoff agent (POST .../specs/<name>/generate) — wraps the
 * scope prompt and launches a router-side executor run that streams on the
 * run page. Returns the runId to navigate to. Fails with an install hint when
 * the workspace lacks the grilling skill.
 */
export function useGeneratePhases(workspaceId: string | null) {
  return useMutation({
    mutationFn: async ({
      name,
      guidance,
      model,
      bookkeepingModel,
      orchestratorModel,
      executorModel,
    }: {
      name: string
      guidance?: string
      model?: string
      bookkeepingModel?: string
      orchestratorModel?: string
      executorModel?: string
    }) => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/specs/${encodeURIComponent(name)}/generate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ guidance, model, bookkeepingModel, orchestratorModel, executorModel }),
        },
      )
      if (!res.ok) throw new Error(await errorMessage(res))
      const data = (await res.json()) as { runId?: string }
      if (data.runId === undefined) throw new Error('Router did not return a run id')
      return { runId: data.runId }
    },
  })
}
