import { useMemo } from 'react'
import { useUiSocket } from '@/lib/useUiSocket'
import { useWorkspaces } from '@/lib/useWorkspaces'
import { Header } from '@/components/Header'
import {
  LandingPage,
  workspaceIdFromPath,
  sessionIdFromPath,
  runIdFromPath,
  skillIdFromPath,
  profileNameFromPath,
  presetNameFromPath,
} from '@/components/LandingPage'
import { WorkspacePage } from '@/components/WorkspacePage'
import { SessionPage } from '@/components/SessionPage'
import { RunPage } from '@/components/RunPage'
import { Toasts } from '@/components/Toasts'
import { ScrollRestore } from '@/components/ScrollRestore'
import { usePathname } from '@/lib/useLocation'
import { useWorkspaceInfo } from '@/lib/useWorkspaceInfo'
import { useSkillDetail } from '@/lib/useSkills'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { runTitle } from '@/lib/runTitle'
import { titleFromSlug } from '@/lib/utils'
import { FolderOpen } from 'lucide-react'

export default function App() {
  const { conn, folders, port, toasts, dismissToast, runs, notifications, dismissNotification, markNotificationsRead, clearNotifications } = useUiSocket()
  const workspaces = useWorkspaces(conn, folders)

  const pathname = usePathname()

  // Route ids — all computed up front so the title-data hooks below stay
  // unconditional. Sessions and agentic runs live at their own routes,
  // workspace-independent.
  const sessionId = sessionIdFromPath(pathname)
  const runId = runIdFromPath(pathname)
  const workspaceId = workspaceIdFromPath(pathname)
  const skillId = skillIdFromPath(pathname)
  const profileName = profileNameFromPath(pathname)
  const presetName = presetNameFromPath(pathname)

  const workspace =
    workspaceId !== null && workspaces !== null
      ? (workspaces.find((w) => w.id === workspaceId) ?? null)
      : null

  // Route data for the browser-tab title (null-safe hooks; react-query caches
  // the skill fetch shared with SkillDetail).
  const info = useWorkspaceInfo(workspaceId, conn)
  const { data: skill } = useSkillDetail(workspaceId, skillId, conn)

  // Dynamic tab title derived from the current route.
  const pageTitle = useMemo(() => {
    if (sessionId !== null) {
      return folders.find((f) => f.sessionId === sessionId)?.name ?? 'Session'
    }
    if (runId !== null) {
      const run = runs[runId]
      return run === undefined ? 'Skill run' : runTitle(run)
    }
    if (workspaceId === null) return 'Workspaces'
    if (workspace === null) return `Unknown workspace: ${workspaceId}`
    if (skillId !== null) {
      return skill !== undefined ? titleFromSlug(skill.name) : titleFromSlug(skillId)
    }
    if (profileName !== null) return titleFromSlug(profileName)
    if (presetName !== null) return titleFromSlug(presetName)
    // Workspace overview — prefer the git identity, mirroring the page header.
    return info?.repo ?? info?.branch ?? info?.folder ?? workspace.name
  }, [sessionId, runId, workspaceId, skillId, profileName, presetName, folders, runs, workspace, info, skill])
  useDocumentTitle(pageTitle)

  if (sessionId !== null) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Header
          conn={conn}
          port={port}
          runs={runs}
          workspaces={workspaces}
          folders={folders}
          notifications={notifications}
          dismissNotification={dismissNotification}
          markNotificationsRead={markNotificationsRead}
          clearNotifications={clearNotifications}
        />
        <SessionPage sessionId={sessionId} conn={conn} />
        <ScrollRestore />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  if (runId !== null) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <Header
          conn={conn}
          port={port}
          runs={runs}
          workspaces={workspaces}
          folders={folders}
          notifications={notifications}
          dismissNotification={dismissNotification}
          markNotificationsRead={markNotificationsRead}
          clearNotifications={clearNotifications}
        />
        <RunPage runId={runId} conn={conn} />
        <ScrollRestore />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header
        conn={conn}
        port={port}
        runs={runs}
        workspaces={workspaces}
        folders={folders}
        notifications={notifications}
        dismissNotification={dismissNotification}
        markNotificationsRead={markNotificationsRead}
        clearNotifications={clearNotifications}
      />
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
        <WorkspacePage conn={conn} workspace={workspace} info={info} />
      )}
      <ScrollRestore />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
