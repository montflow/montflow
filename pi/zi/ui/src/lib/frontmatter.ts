// Minimal tolerant frontmatter helpers for the create-profile dialog: extract
// the `skills:` list and inject a new one without touching the rest of the
// pasted PROFILE.md. Mirrors the backend parser (profiles/model.ts).

const unquote = (value: string): string => {
  if (value.length >= 2) {
    const first = value.charAt(0)
    const last = value.charAt(value.length - 1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  }
  return value
}

export interface ParsedFrontmatter {
  /** Scalars stay strings; `key:` followed by indented `- item` lines become string arrays. */
  readonly fields: Record<string, string | string[]>
  /** Markdown body after the closing `---`. */
  readonly body: string
}

/**
 * Splits a markdown document into frontmatter fields + body. Returns null
 * when the document has no `---`-delimited frontmatter block.
 */
export function parseFrontmatter(markdown: string): ParsedFrontmatter | null {
  const lines = markdown.split(/\r?\n/)
  if ((lines[0] ?? '').trim() !== '---') return null

  let endIndex = -1
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index
      break
    }
  }
  if (endIndex === -1) return null

  const fields: Record<string, string | string[]> = {}
  const fmLines = lines.slice(1, endIndex)
  let index = 0
  while (index < fmLines.length) {
    const line = fmLines[index] ?? ''
    const trimmed = line.trim()
    index++

    if (trimmed === '' || trimmed.startsWith('#')) continue
    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed)
    if (match === null) continue

    const key = match[1] ?? ''
    const rawValue = (match[2] ?? '').trim()
    if (rawValue === '') {
      // Collect an indented list.
      const items: string[] = []
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '')
        if (listMatch === null) break
        items.push(unquote((listMatch[1] ?? '').trim()))
        index++
      }
      fields[key] = items
    } else {
      fields[key] = unquote(rawValue)
    }
  }

  return { fields, body: lines.slice(endIndex + 1).join('\n') }
}

/** Extracts the `skills:` frontmatter list (empty when absent). */
export function skillsFromMarkdown(markdown: string): string[] {
  const fm = parseFrontmatter(markdown)
  const skills = fm?.fields['skills']
  if (!Array.isArray(skills)) return []
  return skills.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

/**
 * Returns `markdown` with its frontmatter `skills:` list replaced by `skills`
 * (an empty list removes the block). When the document has no frontmatter, a
 * minimal one holding only the skills list is prepended. Everything else is
 * preserved byte-for-byte.
 */
export function withSkills(markdown: string, skills: readonly string[]): string {
  const lines = markdown.split(/\r?\n/)
  const block = skills.length > 0 ? ['skills:', ...skills.map((skill) => `  - ${skill}`)] : []

  // No frontmatter → prepend a minimal one.
  if ((lines[0] ?? '').trim() !== '---') {
    if (block.length === 0) return markdown
    const body = markdown.replace(/^\n+/, '')
    return `${['---', ...block, '---'].join('\n')}\n\n${body}`
  }

  let endIndex = -1
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index
      break
    }
  }
  if (endIndex === -1) return markdown // malformed — leave untouched

  const out: string[] = []
  let replaced = false
  for (let index = 1; index < endIndex; index++) {
    if ((lines[index] ?? '').trim() === 'skills:') {
      out.push(...block)
      replaced = true
      // Skip the old indented items.
      let next = index + 1
      while (next < endIndex && /^[ \t]+-\s+/.test(lines[next] ?? '')) next++
      index = next - 1
    } else {
      out.push(lines[index] ?? '')
    }
  }
  if (!replaced) out.push(...block)

  const tail = lines.slice(endIndex + 1).join('\n')
  return ['---', ...out, '---'].join('\n') + (tail === '' ? '' : `\n${tail}`)
}
