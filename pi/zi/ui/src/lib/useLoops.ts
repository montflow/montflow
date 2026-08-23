import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LoopDetail } from '../protocol'

/**
 * Server-backed loops hooks — the REAL loop runtime (wiki/loop.md).
 *
 * Loops execute INSIDE the router daemon (run-loop.ts): kickoff → scoper →
 * reviewer fan-out → aggregation → fixer → supervisor verdict, driven by a
 * plain-code orchestrator that persists loop.json under
 * `.agents/@montflow/loops/<loopId>/`. Each agent phase is a real isolated
 * run streamed over the socket's skillGen channel — open any agent's runId
 * to watch its live thoughts.
 *
 * This list/detail cache refreshes on every `loopUpdated` WS push (see
 * useUiSocket), so rows + detail stay live while agents work.
 */

const loopsUrl = (workspaceId: string): string => `/api/workspaces/${workspaceId}/loops`
const loopActionUrl = (workspaceId: string, loopId: string, action: 'stop' | 'resume' | 'decision'): string =>
  `${loopsUrl(workspaceId)}/${loopId}/${action}`

/** Inputs a kickoff needs to resolve before the loop can be dispatched. */
export interface KickoffScope {
  type: 'git-unstaged'
}
export interface KickoffAgenticScope {
  type: 'agentic'
  /** The feature/spec goal the scoper resolves into a review scope. */
  goal: string
}
export type KickoffOptions =
  | { preset: string; scope: KickoffScope }
  | { preset: string; scope: KickoffAgenticScope }

/** List loops for a workspace — newest state-file write first. */
export function useLoops(
  workspaceId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  return useQuery({
    queryKey: ['loops', workspaceId],
    queryFn: async (): Promise<LoopDetail[]> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(loopsUrl(workspaceId))
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed to load loops (${res.status})`)
      }
      const body = (await res.json()) as { loops: LoopDetail[] }
      return body.loops
    },
    enabled: workspaceId !== null && conn !== 'closed',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/**
 * Rich detail for one loop — the summary plus its agent roster and history
 * timeline, derived from the shared list cache (same key, so loopUpdated
 * invalidations refresh this too).
 */
export function useLoopDetail(
  workspaceId: string | null,
  loopId: string | null,
  conn: 'connecting' | 'open' | 'closed',
) {
  const { data: loops, ...rest } = useLoops(workspaceId, conn)
  const detail = loops?.find((l) => l.id === loopId) ?? null
  return { ...rest, data: detail }
}

/**
 * Dispatch a kickoff: the router scaffolds the loop directory, snapshots the
 * preset budget, and starts driving it immediately. Resolves with the fresh
 * loop row so the dialog can navigate to its detail page.
 */
export function useCreateLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (options: KickoffOptions): Promise<LoopDetail> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(loopsUrl(workspaceId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options),
      })
      const body = (await res.json().catch(() => null)) as { loop?: LoopDetail; error?: string } | null
      if (!res.ok || body?.loop === undefined) {
        throw new Error(body?.error ?? `Kickoff failed (${res.status})`)
      }
      return body.loop
    },
    onSuccess: () => {
      if (workspaceId === null) return
      void queryClient.invalidateQueries({ queryKey: ['loops', workspaceId] })
    },
  })
}

/** Stop a running loop — aborts in-flight agents and persists the interruption. */
export function useStopLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string): Promise<LoopDetail> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(loopActionUrl(workspaceId, loopId, 'stop'), { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { loop?: LoopDetail; error?: string } | null
      if (!res.ok || body?.loop === undefined) throw new Error(body?.error ?? `Stop failed (${res.status})`)
      return body.loop
    },
    onSuccess: () => {
      if (workspaceId === null) return
      void queryClient.invalidateQueries({ queryKey: ['loops', workspaceId] })
    },
  })
}

/**
 * Resume a stopped/errored/incomplete loop from its last recorded step. A
 * loop awaiting a cap decision must go through {@link useDecideLoop} first.
 */
export function useResumeLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string): Promise<LoopDetail> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(loopActionUrl(workspaceId, loopId, 'resume'), { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { loop?: LoopDetail; error?: string } | null
      if (!res.ok || body?.loop === undefined) throw new Error(body?.error ?? `Resume failed (${res.status})`)
      return body.loop
    },
    onSuccess: () => {
      if (workspaceId === null) return
      void queryClient.invalidateQueries({ queryKey: ['loops', workspaceId] })
    },
  })
}

/**
 * Answer an `awaiting-user` cap decision: raise the cycle budget by one,
 * raise the loop budget by one (each buys exactly one more pass), or mark
 * the loop incomplete. Caps are never passed automatically.
 */
export function useDecideLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loopId, action }: { loopId: string; action: 'raise-cycles' | 'raise-loops' | 'complete' }): Promise<LoopDetail> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(loopActionUrl(workspaceId, loopId, 'decision'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = (await res.json().catch(() => null)) as { loop?: LoopDetail; error?: string } | null
      if (!res.ok || body?.loop === undefined) throw new Error(body?.error ?? `Decision failed (${res.status})`)
      return body.loop
    },
    onSuccess: () => {
      if (workspaceId === null) return
      void queryClient.invalidateQueries({ queryKey: ['loops', workspaceId] })
    },
  })
}

/** Delete a stopped loop and its artifacts (scope, passes, loop.json). */
export function useDeleteLoop(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loopId: string): Promise<void> => {
      if (workspaceId === null) throw new Error('No workspace selected')
      const res = await fetch(`${loopsUrl(workspaceId)}/${loopId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Delete failed (${res.status})`)
      }
    },
    onSuccess: () => {
      if (workspaceId === null) return
      void queryClient.invalidateQueries({ queryKey: ['loops', workspaceId] })
    },
  })
}
