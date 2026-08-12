import type { SkillRunState } from '@/lib/useUiSocket'

/** Strip markdown noise and collapse whitespace for display. */
const clean = (s: string): string => s.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim()

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/**
 * Best-effort short title for an agentic skill run.
 *
 * Prefers the agent's summary — "Created **echo-hi** — a tiny skill that
 * replies hi" → "Create echo-hi — a tiny skill that replies hi". Falls back
 * to the user's prompt (their intent) while the run is in flight.
 */
export const runTitle = (run: SkillRunState): string => {
  // Prefer the generated title (opencode big-pickle, from the prompt); it is
  // set shortly after the run starts and survives restarts via the snapshot.
  const generated = run.title?.trim()
  if (generated !== undefined && generated !== '') return truncate(generated, 64)
  const lastAssistant =
    [...run.entries].reverse().find((entry) => entry.role === 'assistant')?.text ?? ''
  const created = lastAssistant.match(
    /[Cc]reated\s+(?:\*\*|`)?([a-z0-9][a-z0-9._-]*)(?:\*\*|`)?\s*(?:—|--|-|:)\s*([^\n]+)/s,
  )
  if (created !== null) {
    const name = created[1] ?? ''
    const desc = clean(created[2] ?? '')
    // Drop trailing "at .agents/skills/…" noise from the description.
    const shortDesc = desc.replace(/\s+at\s+\.agents\/skills\/.*$/i, '')
    const tail = truncate(shortDesc, 44)
    return tail !== '' ? `Create ${name} — ${tail}` : `Create ${name}`
  }
  const prompt = run.entries.find((entry) => entry.role === 'user')?.text ?? ''
  const cleaned = truncate(clean(prompt.split('\n')[0] ?? prompt), 64)
  return cleaned !== '' ? cleaned : 'Skill run'
}
