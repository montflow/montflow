import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useSkills } from '@/lib/useSkills'
import { Search, X } from 'lucide-react'

interface SkillPickerProps {
  workspaceId: string
  conn: 'connecting' | 'open' | 'closed'
  /** Currently selected skill names (frontmatter names). */
  selected: readonly string[]
  /** Called with the next selection whenever a skill is toggled. */
  onChange: (skills: string[]) => void
  /** Input id for the label's htmlFor (unique per dialog). */
  inputId: string
  /** Label rendered above the search input. */
  label?: string
}

/**
 * Skill multi-select: a searchable picklist of the workspace's skills plus
 * removable chips for the selection. Shared by the manual and agentic
 * profile dialogs so both modes pick skills the same way.
 */
export function SkillPicker({
  workspaceId,
  conn,
  selected,
  onChange,
  inputId,
  label = 'Skills',
}: SkillPickerProps) {
  const skillsQuery = useSkills(workspaceId, conn)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  /** Skills available to add: filtered by query, already-selected ones hidden. */
  const results = useMemo(() => {
    const all = skillsQuery.data ?? []
    const chosen = new Set(selected)
    const trimmed = query.trim().toLowerCase()
    const matches = all.filter((skill) => {
      if (chosen.has(skill.name)) return false
      if (trimmed === '') return true
      return (
        skill.name.toLowerCase().includes(trimmed) ||
        skill.description.toLowerCase().includes(trimmed) ||
        skill.groups.some((group) => group.toLowerCase().includes(trimmed))
      )
    })
    // Preview a handful on focus; typed queries reveal more matches.
    return trimmed === '' ? matches.slice(0, 5) : matches.slice(0, 12)
  }, [skillsQuery.data, selected, query])

  const toggle = (skillName: string): void => {
    const next = new Set(selected)
    if (next.has(skillName)) next.delete(skillName)
    else next.add(skillName)
    onChange([...next])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((skill) => (
            <Badge key={skill} variant="secondary" className="gap-1 pr-1">
              <span className="font-mono">{skill}</span>
              <button
                type="button"
                onClick={() => toggle(skill)}
                title={`Remove ${skill}`}
                aria-label={`Remove ${skill}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div
        className="relative"
        onKeyDown={(event) => {
          // Escape dismisses the picklist first; only when the picklist is
          // already closed does it bubble to the dialog (which would discard
          // the form state).
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          autoComplete="off"
          disabled={skillsQuery.isPending || (skillsQuery.data?.length ?? 0) === 0}
          placeholder={
            skillsQuery.isPending
              ? 'Loading skills…'
              : (skillsQuery.data?.length ?? 0) === 0
                ? 'No skills in this workspace yet'
                : 'Search existing skills…'
          }
          className="pl-8"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="max-h-56 overflow-y-auto">
              {results.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggle(skill.name)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-xs font-medium">{skill.name}</span>
                  {skill.description !== '' && (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {skill.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {open && query.trim() !== '' && results.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No matching skills.</p>
        )}
      </div>
    </div>
  )
}
