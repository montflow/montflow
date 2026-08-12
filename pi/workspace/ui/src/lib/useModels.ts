import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ModelChoice } from '../protocol'

export interface ModelsState {
  /** Models pickable for agentic runs (union across connected sessions). */
  models: ModelChoice[]
  /** Persisted picker selection (`provider/model-id`); null = follow session. */
  selected: string | null
}

const fetchModels = async (): Promise<ModelsState> => {
  const res = await fetch('/api/models')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { models?: ModelChoice[]; selected?: string | null }
  return { models: data.models ?? [], selected: data.selected ?? null }
}

/**
 * Router-wide model picker state (react-query backed). The router pushes a
 * `modelsChanged` WebSocket event whenever the union or the selection
 * changes — useUiSocket invalidates this query so every tab stays in sync.
 */
export function useModels(conn: 'connecting' | 'open' | 'closed') {
  return useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    // Don't fetch while the router is unreachable; refetch once it reconnects.
    enabled: conn !== 'closed',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Persists the agentic-run model choice. The router broadcasts the change
 * to every browser (modelsChanged), so the cache update here is just for
 * snappy local feedback — other tabs converge via the WebSocket event.
 */
export function useSetModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (selected: string | null) => {
      const res = await fetch('/api/models', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selected }),
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
      const data = (await res.json()) as { models?: ModelChoice[]; selected?: string | null }
      return { models: data.models ?? [], selected: data.selected ?? null }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ModelsState>(['models'], (prev) => ({
        models: data.models.length > 0 ? data.models : prev?.models ?? [],
        selected: data.selected,
      }))
    },
  })
}
