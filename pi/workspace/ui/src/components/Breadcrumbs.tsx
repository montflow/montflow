import { Fragment, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { navigate, usePathname } from '@/lib/useLocation'
import {
  presetNameFromPath,
  profileNameFromPath,
  runIdFromPath,
  sessionIdFromPath,
  skillIdFromPath,
  workspaceIdFromPath,
  workspaceUrl,
} from '@/components/LandingPage'
import { runTitle } from '@/lib/runTitle'
import { titleFromSlug } from '@/lib/utils'
import type { WorkspaceInfo, FolderInfo } from '@/protocol'
import type { SkillRunState } from '@/lib/useUiSocket'

interface Crumb {
  /** Display label. */
  label: string
  /** Navigate target; null = the current page (rendered as plain text). */
  target: string | null
  /** Long labels (workspace names, run titles) truncate in the bar. */
  truncate?: boolean
}

interface BreadcrumbsProps {
  workspaces: WorkspaceInfo[] | null
  folders: FolderInfo[]
  runs: Record<string, SkillRunState>
}

/** Landing page root — every non-root breadcrumb path starts here. */
const ROOT: Crumb = { label: 'Home', target: '/' }

/**
 * Target for a section crumb (Skills/Profiles): the workspace page
 * with a `?section=` deep link. WorkspacePage opens the section if it was
 * collapsed and scrolls it into view. Existing query params (e.g. the Runs
 * status filter) are kept.
 */
const sectionTarget = (workspaceId: string, section: string): string => {
  const params = new URLSearchParams(location.search)
  params.set('section', section)
  const search = params.toString()
  return workspaceUrl(workspaceId) + (search === '' ? '' : `?${search}`)
}

/**
 * Breadcrumb trail for the current route, replacing the old Home button and
 * per-page "Back to …" buttons. The workspace crumb carries the current
 * query string so list filters (e.g. the Runs status filter) survive the
 * hop back from a detail page.
 */
const buildCrumbs = (
  pathname: string,
  workspaces: WorkspaceInfo[] | null,
  folders: FolderInfo[],
  runs: Record<string, SkillRunState>,
): Crumb[] => {
  const workspaceId = workspaceIdFromPath(pathname)

  if (workspaceId !== null) {
    const ws = workspaces?.find((w) => w.id === workspaceId) ?? null
    const wsLabel = ws?.name ?? workspaceId
    // Preserve section filters when leaving a detail page.
    const wsTarget = workspaceUrl(workspaceId) + location.search

    const skillId = skillIdFromPath(pathname)
    if (skillId !== null) {
      return [
        ROOT,
        { label: wsLabel, target: wsTarget, truncate: true },
        { label: 'Skills', target: sectionTarget(workspaceId, 'skills') },
        { label: titleFromSlug(skillId), target: null, truncate: true },
      ]
    }

    const profileName = profileNameFromPath(pathname)
    if (profileName !== null) {
      return [
        ROOT,
        { label: wsLabel, target: wsTarget, truncate: true },
        { label: 'Profiles', target: sectionTarget(workspaceId, 'profiles') },
        { label: titleFromSlug(profileName), target: null, truncate: true },
      ]
    }

    const presetName = presetNameFromPath(pathname)
    if (presetName !== null) {
      return [
        ROOT,
        { label: wsLabel, target: wsTarget, truncate: true },
        { label: 'Presets', target: sectionTarget(workspaceId, 'presets') },
        { label: titleFromSlug(presetName), target: null, truncate: true },
      ]
    }

    return [
      ROOT,
      { label: wsLabel, target: null, truncate: true }, // workspace page itself
    ]
  }

  const sessionId = sessionIdFromPath(pathname)
  if (sessionId !== null) {
    const folder = folders.find((f) => f.sessionId === sessionId) ?? null
    return [
      ROOT,
      { label: 'Sessions', target: null },
      { label: folder?.name ?? sessionId, target: null, truncate: true },
    ]
  }

  const runId = runIdFromPath(pathname)
  if (runId !== null) {
    const run = runs[runId]
    const wsId = run?.workspaceId
    if (wsId !== undefined) {
      const ws = workspaces?.find((w) => w.id === wsId) ?? null
      return [
        ROOT,
        { label: ws?.name ?? wsId, target: workspaceUrl(wsId) + location.search, truncate: true },
        { label: 'Runs', target: sectionTarget(wsId, 'runs') },
        { label: run !== undefined ? runTitle(run) : 'Skill run', target: null, truncate: true },
      ]
    }
    // Run record not yet loaded (fresh reload before the socket snapshot) —
    // keep the trail stable; the workspace crumb appears once it arrives.
    return [
      ROOT,
      { label: 'Runs', target: null },
      { label: run !== undefined ? runTitle(run) : 'Skill run', target: null, truncate: true },
    ]
  }

  return [ROOT] // landing page
}

export function Breadcrumbs({ workspaces, folders, runs }: BreadcrumbsProps) {
  const pathname = usePathname()
  const crumbs = useMemo(
    () => buildCrumbs(pathname, workspaces, folders, runs),
    [pathname, workspaces, folders, runs],
  )

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        {crumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
            {crumb.target === null ? (
              <li
                aria-current="page"
                className={`min-w-0 font-medium text-foreground ${crumb.truncate === true ? 'truncate' : ''}`}
              >
                {crumb.label}
              </li>
            ) : (
              <li className="min-w-0">
                <a
                  href={crumb.target}
                  onClick={(event) => {
                    event.preventDefault()
                    navigate(crumb.target!)
                  }}
                  className={`text-muted-foreground transition-colors hover:text-foreground ${crumb.truncate === true ? 'block truncate' : ''}`}
                >
                  {crumb.label}
                </a>
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
