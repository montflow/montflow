import type { WorkspaceInfo } from '@/protocol'
import { ProfilesSection } from '@/components/ProfilesSection'
import { SkillsSection } from '@/components/SkillsSection'
import { PresetsSection } from '@/components/PresetsSection'
import { SkillDetail } from '@/components/SkillDetail'
import { ProfileDetail } from '@/components/ProfileDetail'
import { PresetDetail } from '@/components/PresetDetail'
import { presetNameFromPath, profileNameFromPath, skillIdFromPath } from '@/components/LandingPage'
import { useWorkspaceInfo } from '@/lib/useWorkspaceInfo'
import { usePathname } from '@/lib/useLocation'

interface WorkspacePageProps {
  conn: 'connecting' | 'open' | 'closed'
  workspace: WorkspaceInfo
}

export function WorkspacePage({ conn, workspace }: WorkspacePageProps) {
  const pathname = usePathname()
  const skillId = skillIdFromPath(pathname)
  const profileName = profileNameFromPath(pathname)
  const presetName = presetNameFromPath(pathname)
  // Hooks must run unconditionally — fetch workspace info even when the
  // detail views short-circuit below (cached by react-query anyway).
  const info = useWorkspaceInfo(workspace.id, conn)

  if (skillId !== null) {
    return <SkillDetail workspaceId={workspace.id} skillId={skillId} conn={conn} />
  }

  if (profileName !== null) {
    return <ProfileDetail workspaceId={workspace.id} profileName={profileName} conn={conn} />
  }

  if (presetName !== null) {
    return (
      <PresetDetail
        workspaceId={workspace.id}
        presetName={presetName}
        conn={conn}
        folder={info?.folder ?? null}
      />
    )
  }

  const folder = info?.folder ?? workspace.name
  const repo = info?.repo
  const branch = info?.branch
  const path = info?.path ?? workspace.path

  const title = repo ?? branch ?? folder
  const showBranch = Boolean(repo && branch)

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <header className="mb-6">
        <h1 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
          <span className="truncate">{title}</span>
          {showBranch && (
            <span className="font-mono text-sm font-normal text-muted-foreground">{branch}</span>
          )}
        </h1>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={path}>
          {path}
        </p>
      </header>

      <SkillsSection workspaceId={workspace.id} conn={conn} folder={info?.folder ?? null} />

      <ProfilesSection workspaceId={workspace.id} conn={conn} folder={info?.folder ?? null} />

      <PresetsSection workspaceId={workspace.id} conn={conn} folder={info?.folder ?? null} />
    </main>
  )
}
