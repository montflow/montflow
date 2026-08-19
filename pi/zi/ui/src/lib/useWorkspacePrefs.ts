import { useCallback, useRef, useState } from 'react'

export type PanelKey = 'skills' | 'profiles' | 'presets' | 'prompts' | 'loops' | 'runs'

/** Per-panel UI state persisted per workspace in localStorage. */
export interface PanelPrefs {
  /** CollapsibleSection open state. */
  open: boolean
  /** Search box text. */
  query: string
  /** Selected filter chips (skills → groups, profiles → skills). */
  chips: string[]
  /** Column sort (TanStack SortingState shape). */
  sort: { id: string; desc: boolean }[]
}

export type WorkspacePrefs = Record<PanelKey, PanelPrefs>

const STORAGE_PREFIX = 'montflow:workspace-prefs:'

const DEFAULTS: WorkspacePrefs = {
  skills: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
  profiles: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
  presets: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
  prompts: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
  loops: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
  runs: { open: true, query: '', chips: [], sort: [{ id: 'name', desc: false }] },
}

const loadPrefs = (workspaceId: string): WorkspacePrefs => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + workspaceId)
    if (raw === null) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>
    return {
      skills: { ...DEFAULTS.skills, ...parsed.skills },
      profiles: { ...DEFAULTS.profiles, ...parsed.profiles },
      presets: { ...DEFAULTS.presets, ...parsed.presets },
      prompts: { ...DEFAULTS.prompts, ...parsed.prompts },
      loops: { ...DEFAULTS.loops, ...parsed.loops },
      runs: { ...DEFAULTS.runs, ...parsed.runs },
    }
  } catch {
    return DEFAULTS
  }
}

const savePrefs = (workspaceId: string, prefs: WorkspacePrefs): void => {
  try {
    localStorage.setItem(STORAGE_PREFIX + workspaceId, JSON.stringify(prefs))
  } catch {
    // Storage full or unavailable (private mode) — best effort only.
  }
}

/**
 * Per-workspace UI state (panel open/closed, search text, filter chips,
 * column sort) persisted to localStorage and restored on mount. Each
 * workspace gets its own entry, so the panels come back exactly as the
 * user left them when returning to that workspace.
 */
export function useWorkspacePrefs(
  workspaceId: string,
  panel: PanelKey,
): [PanelPrefs, (patch: Partial<PanelPrefs>) => void] {
  const [prefs, setPrefs] = useState<WorkspacePrefs>(() => loadPrefs(workspaceId))

  // Switching /w/a/ → /w/b/ reuses the same component instance (App always
  // renders WorkspacePage), so the useState initializer above only runs once.
  // Reload prefs when the workspace id changes.
  const prevWorkspace = useRef(workspaceId)
  if (prevWorkspace.current !== workspaceId) {
    prevWorkspace.current = workspaceId
    setPrefs(loadPrefs(workspaceId))
  }

  const update = useCallback(
    (patch: Partial<PanelPrefs>): void => {
      setPrefs((prev) => {
        const next: WorkspacePrefs = { ...prev, [panel]: { ...prev[panel], ...patch } }
        savePrefs(workspaceId, next)
        return next
      })
    },
    [workspaceId, panel],
  )

  return [prefs[panel], update]
}
