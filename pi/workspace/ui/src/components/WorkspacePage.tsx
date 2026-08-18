import { useEffect, useMemo, type ReactNode } from 'react'
import type { WorkspaceInfo, WorkspaceInfoDetail } from '@/protocol'
import { ProfilesSection } from '@/components/ProfilesSection'
import { SkillsSection } from '@/components/SkillsSection'
import { PresetsSection } from '@/components/PresetsSection'
import { RunsSection } from '@/components/RunsSection'
import { SkillDetail } from '@/components/SkillDetail'
import { ProfileDetail } from '@/components/ProfileDetail'
import { PresetDetail } from '@/components/PresetDetail'
import { CommandPalette, type PaletteCommand } from '@/components/CommandPalette'
import { presetNameFromPath, profileNameFromPath, skillIdFromPath, workspaceUrl } from '@/components/LandingPage'
import { navigate, setSearchParams, usePathname, useSearchParams } from '@/lib/useLocation'
import { skipNextRestore } from '@/lib/scrollRestoration'

interface WorkspacePageProps {
  conn: 'connecting' | 'open' | 'closed'
  workspace: WorkspaceInfo
  /** Router-computed git info (folder, repo, branch, path) — fetched by App for the tab title. */
  info: WorkspaceInfoDetail | null
}

export function WorkspacePage({ conn, workspace, info }: WorkspacePageProps) {
  const pathname = usePathname()
  const skillId = skillIdFromPath(pathname)
  const profileName = profileNameFromPath(pathname)
  const presetName = presetNameFromPath(pathname)

  // Breadcrumb section links (?section=skills) — the section to scroll to.
  const params = useSearchParams()
  const section = params.get('section')

  // Deep link: open the section (via its `reveal` prop, so a collapsed panel
  // expands) and scroll it into view, then drop the param so it doesn't
  // re-fire on every visit to the workspace page.
  useEffect(() => {
    if (section === null) return
    const next = new URLSearchParams(params)
    next.delete('section')
    // The param cleanup replaces the URL — stop scroll restoration from
    // replaying a stale position under the section scroll below.
    skipNextRestore()
    setSearchParams(next)
    // Wait a frame so the revealed section is rendered before scrolling.
    requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // Command palette: smooth-scroll to a workspace section. On detail views
  // (skill/profile/preset) the sections aren't mounted, so navigate to the
  // overview first and scroll once it renders.
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const goTo = (id: string): (() => void) => () => {
      const el = document.getElementById(id)
      if (el !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      navigate(workspaceUrl(workspace.id))
      let attempts = 0
      const scrollWhenReady = (): void => {
        const target = document.getElementById(id)
        if (target !== null) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        else if (attempts++ < 30) requestAnimationFrame(scrollWhenReady)
      }
      requestAnimationFrame(scrollWhenReady)
    }
    return [
      { id: 'go-skills', label: 'workspace: go to skills', run: goTo('skills') },
      { id: 'go-profiles', label: 'workspace: go to profiles', run: goTo('profiles') },
      { id: 'go-presets', label: 'workspace: go to presets', run: goTo('presets') },
      { id: 'go-runs', label: 'workspace: go to runs', run: goTo('runs') },
    ]
  }, [workspace.id])

  let body: ReactNode
  if (skillId !== null) {
    body = (
      <SkillDetail
        workspaceId={workspace.id}
        skillId={skillId}
        conn={conn}
        folder={info?.folder ?? null}
      />
    )
  } else if (profileName !== null) {
    body = (
      <ProfileDetail
        workspaceId={workspace.id}
        profileName={profileName}
        conn={conn}
        folder={info?.folder ?? null}
      />
    )
  } else if (presetName !== null) {
    body = (
      <PresetDetail
        workspaceId={workspace.id}
        presetName={presetName}
        conn={conn}
        folder={info?.folder ?? null}
      />
    )
  } else {
    const folder = info?.folder ?? workspace.name
    const repo = info?.repo
    const branch = info?.branch
    const path = info?.path ?? workspace.path

    const title = repo ?? branch ?? folder
    const showBranch = Boolean(repo && branch)

    body = (
      <main data-scroll-region className="flex-1 overflow-y-auto p-4">
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

        <SkillsSection workspaceId={workspace.id} conn={conn} folder={info?.folder ?? null} id="skills" reveal={section === 'skills'} />

        <ProfilesSection workspaceId={workspace.id} conn={conn} folder={info?.folder ?? null} id="profiles" reveal={section === 'profiles'} />

        <PresetsSection workspaceId={workspace.id} conn={conn} id="presets" reveal={section === 'presets'} />

        <RunsSection workspaceId={workspace.id} conn={conn} id="runs" reveal={section === 'runs'} />
      </main>
    )
  }

  return (
    <>
      {body}
      <CommandPalette commands={paletteCommands} />
    </>
  )
}
