/** Template placeholder token, e.g. `{{files}}` (loose spaces tolerated). */
const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g

/** Escape a string for use inside a RegExp literal. */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The ordered, de-duplicated placeholder names referenced in a template as
 * `{{name}}`. Names are trimmed; empty tokens are dropped.
 */
export const promptPlaceholders = (template: string): string[] => {
  const names: string[] = []
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1]?.trim()
    if (name !== '' && name !== undefined && !names.includes(name)) names.push(name)
  }
  return names
}

/** True when the template references the given variable as `{{name}}`. */
export const templateUsesVariable = (template: string, name: string): boolean =>
  new RegExp(`\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}`).test(template)

/**
 * Render a prompt template with collected variable values. Every `{{name}}`
 * token is replaced with `values[name]`; tokens with no value are left
 * verbatim so the user can see what is still unfilled.
 */
export const renderPrompt = (template: string, values: Record<string, string>): string =>
  template.replace(PLACEHOLDER_RE, (token, rawName: string) => {
    const name = rawName.trim()
    const value = values[name]
    return value !== undefined && value !== '' ? value : token
  })
