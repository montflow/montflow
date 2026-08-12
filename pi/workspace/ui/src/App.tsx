import { useUiSocket } from '@/lib/useUiSocket'
import { useWorkspaces } from '@/lib/useWorkspaces'
import { Header } from '@/components/Header'
import { LandingPage, workspaceIdFromPath, sessionIdFromPath, runIdFromPath } from '@/components/LandingPage'
import { WorkspacePage } from '@/components/WorkspacePage'
import { SessionPage } from '@/components/SessionPage'
import { RunPage } from '@/components/RunPage'
import { Toasts } from '@/components/Toasts'
import { ScrollRestore } from '@/components/ScrollRestore'
import { usePathname } from '@/lib/useLocation'
import { FolderOpen } from 'lucide-react'

export default function App() {
  const { conn, folders, port, toasts, dismissToast, runs } = useUiSocket()
  const workspaces = useWorkspaces(conn, folders)

  const pathname = usePathname()

  // Sessions and agentic runs live at their own routes, workspace-independent.
  const sessionId = sessionIdFromPath(pathname)
  if (sessionId !== null) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Header conn={conn} port={port} runs={runs} workspaces={workspaces} folders={folders} />
        <SessionPage sessionId={sessionId} conn={conn} />
        <ScrollRestore />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  const runId = runIdFromPath(pathname)
  if (runId !== null) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Header conn={conn} port={port} runs={runs} workspaces={workspaces} folders={folders} />
        <RunPage runId={runId} conn={conn} />
        <ScrollRestore />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  const workspaceId = workspaceIdFromPath(pathname)
  const workspace =
    workspaceId !== null && workspaces !== null
      ? (workspaces.find((w) => w.id === workspaceId) ?? null)
      : null

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header conn={conn} port={port} runs={runs} workspaces={workspaces} folders={folders} />
      {workspaceId === null ? (
        <LandingPage conn={conn} workspaces={workspaces} />
      ) : workspace === null ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
          <FolderOpen className="size-8 opacity-40" />
          <p>{workspaces === null ? 'Loading workspaces…' : `Unknown workspace: ${workspaceId}`}</p>
          <a href="/" className="text-xs underline">
            Back to workspaces
          </a>
        </main>
      ) : (
        <WorkspacePage conn={conn} workspace={workspace} />
      )}
      <ScrollRestore />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
