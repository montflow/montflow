import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { WorkspaceInfo } from '@/protocol'
import { useQueryClient } from '@tanstack/react-query'
import { removeWorkspace } from '@/lib/useWorkspaces'
import { FolderOpen, FolderTree, X } from 'lucide-react'

/** URL for a workspace page: /w/<workspace-id>/ */
export const workspaceUrl = (id: string): string => `/w/${encodeURIComponent(id)}/`

/** URL for a skill details page: /w/<workspace-id>/skills/<skill-id>/ */
export const skillUrl = (workspaceId: string, skillId: string): string =>
  `/w/${encodeURIComponent(workspaceId)}/skills/${encodeURIComponent(skillId)}/`

/** URL for a profile details page: /w/<workspace-id>/profiles/<name>/ */
export const profileUrl = (workspaceId: string, profileName: string): string =>
  `/w/${encodeURIComponent(workspaceId)}/profiles/${encodeURIComponent(profileName)}/`

/** URL for a preset details page: /w/<workspace-id>/presets/<name>/ */
export const presetUrl = (workspaceId: string, presetName: string): string =>
  `/w/${encodeURIComponent(workspaceId)}/presets/${encodeURIComponent(presetName)}/`

/** URL for a session page: /sessions/<session-id>/ (own route, not workspace-scoped). */
export const sessionUrl = (sessionId: string): string =>
  `/sessions/${encodeURIComponent(sessionId)}/`

/** URL for an agentic skill run: /runs/<run-id>/ (own route, not workspace-scoped). */
export const runUrl = (runId: string): string => `/runs/${encodeURIComponent(runId)}/`

/** Extract the run id from a /runs/<run-id>/ pathname (or null). */
export const runIdFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/runs\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

/** Extract the workspace id from a /w/<id>/... pathname (or null for root). */
export const workspaceIdFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/w\/([^/]+)(?:\/|$)/)
  return match?.[1] ?? null
}

/** Extract the session id from a /sessions/<session-id>/ pathname (or null). */
export const sessionIdFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/sessions\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

/** Extract the skill id from a /w/<id>/skills/<skill-id>/ pathname (or null). */
export const skillIdFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/w\/[^/]+\/skills\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

/** Extract the profile name from a /w/<id>/profiles/<name>/ pathname (or null). */
export const profileNameFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/w\/[^/]+\/profiles\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

/** Extract the preset name from a /w/<id>/presets/<name>/ pathname (or null). */
export const presetNameFromPath = (pathname: string): string | null => {
  const match = decodeURIComponent(pathname).match(/^\/w\/[^/]+\/presets\/([^/]+)\/?$/)
  return match?.[1] ?? null
}
interface LandingPageProps {
  conn: 'connecting' | 'open' | 'closed'
  workspaces: WorkspaceInfo[] | null
}

export function LandingPage({ conn, workspaces }: LandingPageProps) {
  const queryClient = useQueryClient()

  const onRemove = (ws: WorkspaceInfo): void => {
    if (
      !window.confirm(
        `Remove workspace "${ws.name}" from the list?\n\nIts project re-registers automatically the next time /montflow runs there.`,
      )
    ) {
      return
    }
    void removeWorkspace(ws.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['workspaces'] }))
      .catch((error: unknown) => {
        window.alert(error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <main data-scroll-region className="flex-1 overflow-y-auto p-4">
      <h1 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <FolderTree className="size-4" />
        Workspaces
      </h1>

      {conn !== 'open' || workspaces === null ? (
        <p className="text-sm text-muted-foreground">Connecting to the UI router…</p>
      ) : workspaces.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="size-8 opacity-40" />
          <p>No workspaces yet.</p>
          <p className="max-w-md text-center text-xs text-muted-foreground/80">
            Run <code className="rounded bg-muted px-1">/montflow</code> in a pi
            session for a project — it creates{' '}
            <code className="rounded bg-muted px-1">.agents/@montflow/workspace.json</code>{' '}
            (named after the git branch) and registers the workspace here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((ws) => (
            <a key={ws.id} href={workspaceUrl(ws.id)} className="group">
              <Card className="relative transition-colors group-hover:border-primary/40">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 pr-6">
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{ws.name}</span>
                    {ws.connected ? (
                      <Badge variant="secondary" className="shrink-0">
                        connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        offline
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {ws.path}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-1.5 top-1.5 text-muted-foreground/60 hover:text-foreground"
                    title={`Remove ${ws.name} from the list`}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onRemove(ws)
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </main>
  )
}
