import { useMemo, useRef, useState } from 'react'
import { Braces, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { promptPlaceholders, templateUsesVariable } from '@/lib/prompt'
import type { PromptVariable } from '@/protocol'

interface TemplateEditorProps {
  value: string
  onChange: (value: string) => void
  onDirty: () => void
  /** Declared variables — drives both the `{{` autocomplete and highlighting. */
  variables: PromptVariable[]
}

/** Textarea size + padding that BOTH overlay layers share so they align. */
const EDITOR_CLASS =
  'w-full min-h-48 p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words'

/**
 * Highlight the template: escape everything, then wrap `{{name}}` tokens in
 * colored spans — defined variables in one color, orphan tokens in red.
 */
const highlightTemplate = (text: string, variables: readonly PromptVariable[]): string => {
  const defined = new Set(variables.map((v) => v.name))
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = ''
  const token = /\{\{\s*([^}]+?)\s*\}\}/g
  let last = 0
  for (const match of text.matchAll(token)) {
    const index = match.index ?? 0
    html += escapeHtml(text.slice(last, index))
    const name = match[1]?.trim() ?? ''
    const cls = name !== '' && defined.has(name) ? 'text-emerald-400' : 'text-red-400'
    html += `<span class="${cls} font-semibold">${escapeHtml(match[0])}</span>`
    last = index + match[0].length
  }
  html += escapeHtml(text.slice(last))
  return html === '' ? '<br/>' : html
}

/**
 * A dependency-free prompt template editor with `{{variable}}` syntax
 * highlighting and `{{` autocomplete.
 *
 * Highlighting uses the classic overlay trick: a real `<textarea>` (transparent
 * text, visible caret/selection) sits on top of a `<pre>` that renders the same
 * text with token highlighting. Both share identical metrics, and the pre's
 * scroll is synced to the textarea, so the highlight always stays in lockstep
 * with what you type — no editor library required.
 */
export function TemplateEditor({ value, onChange, onDirty, variables }: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [ac, setAc] = useState<{
    open: number
    query: string
    index: number
    x: number
    y: number
  } | null>(null)

  /** Measure the caret's pixel position within the editor (VSCode-like anchor). */
  const measureCaret = (): { x: number; y: number } => {
    const ta = textareaRef.current
    const m = measureRef.current
    if (ta === null || m === null) return { x: 12, y: 12 }
    const pos = ta.selectionStart
    m.style.width = `${Math.max(0, ta.clientWidth - 2)}px` // match the textarea's content box
    m.textContent = ''
    const prefix = document.createElement('span')
    prefix.textContent = value.slice(0, pos)
    const marker = document.createElement('span')
    marker.textContent = '.'
    m.append(prefix, marker)
    const mr = marker.getBoundingClientRect()
    const mb = m.getBoundingClientRect()
    return {
      x: mr.left - mb.left - ta.scrollLeft,
      y: mr.top - mb.top - ta.scrollTop,
    }
  }

  const acOptions = useMemo(() => {
    if (ac === null) return []
    const q = ac.query.trim().toLowerCase()
    if (q === '') return variables
    return variables.filter((v) => {
      const label = (v.label ?? v.name).toLowerCase()
      const name = v.name.toLowerCase()
      return label.includes(q) || name.includes(q)
    })
  }, [ac, variables])

  const highlighted = useMemo(() => highlightTemplate(value, variables), [value, variables])

  const unusedVariables = useMemo(
    () => variables.filter((v) => !templateUsesVariable(value, v.name)),
    [value, variables],
  )
  const orphanPlaceholders = useMemo(
    () => promptPlaceholders(value).filter((name) => !variables.some((v) => v.name === name)),
    [value, variables],
  )

  /** Insert `{{name}}` at the caret (via the toolbar chips). */
  const insertVariable = (name: string): void => {
    const el = textareaRef.current
    if (el === null) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const token = `{{${name}}}`
    onChange(value.slice(0, start) + token + value.slice(end))
    onDirty()
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
      syncScrollToTextarea()
    })
  }

  /** Close the open `{{name` token and insert the accepted variable. */
  const acceptAutocomplete = (name: string | undefined): void => {
    if (name === undefined) return
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? 0
    const before = value.slice(0, cursor)
    const lastOpen = before.lastIndexOf('{{')
    if (lastOpen === -1) return
    const token = `{{${name}}}`
    onChange(before.slice(0, lastOpen) + token + value.slice(cursor))
    onDirty()
    setAc(null)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = lastOpen + token.length
      el?.setSelectionRange(pos, pos)
      syncScrollToTextarea()
    })
  }

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const el = event.currentTarget
    const text = el.value
    const cursor = el.selectionStart
    onChange(text)
    onDirty()
    const before = text.slice(0, cursor)
    const lastOpen = before.lastIndexOf('{{')
    const lastClose = before.lastIndexOf('}}')
    // Inside an un-closed `{{...` → open autocomplete.
    if (lastOpen !== -1 && (lastClose === -1 || lastClose < lastOpen)) {
      const partial = text.slice(lastOpen + 2, cursor)
      if (!/[{}]/.test(partial)) {
        const { x, y } = measureCaret()
        setAc({ open: lastOpen, query: partial, index: 0, x, y })
        return
      }
    }
    setAc(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (ac === null || acOptions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAc((prev) => (prev === null ? prev : { ...prev, index: (prev.index + 1) % acOptions.length }))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAc((prev) =>
        prev === null ? prev : { ...prev, index: (prev.index - 1 + acOptions.length) % acOptions.length },
      )
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      acceptAutocomplete(acOptions[ac.index]?.name)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setAc(null)
    }
  }

  const syncScrollToTextarea = (): void => {
    const textarea = textareaRef.current
    const pre = preRef.current
    if (textarea === null || pre === null) return
    pre.scrollTop = textarea.scrollTop
    pre.scrollLeft = textarea.scrollLeft
  }

  // VSCode-like: anchor the autocomplete under the caret, flip above it when
  // it would run off the bottom of the viewport.
  const ta = textareaRef.current
  const caretLineH = 20 // matches EDITOR_CLASS leading-5
  let menuLeft = 8
  let menuTop = 8
  if (ac !== null && ta !== null) {
    menuLeft = Math.max(4, Math.min(ac.x, ta.clientWidth - 220 - 4))
    const below = window.innerHeight - (ta.getBoundingClientRect().top + ac.y + caretLineH + 4)
    menuTop = below < 200 ? Math.max(4, ac.y - 200) : ac.y + caretLineH + 4
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="prompt-tpl" className="text-xs font-medium text-muted-foreground">
          Template
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {variables.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertVariable(v.name)}
              title={`Insert {{${v.name}}} at the cursor`}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {'{{'}
              {v.name}
              {'}}'}
            </button>
          ))}
        </div>
      </div>

      <div className="group relative focus-within:ring-[3px] focus-within:ring-ring/50">
        {/* Highlighted backdrop — identical metrics to the textarea. */}
        <pre
          ref={preRef}
          aria-hidden
          className={cn(
            EDITOR_CLASS,
            'pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-input text-foreground',
          )}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        {/* Real input on top: transparent text, visible caret + selection. */}
        <textarea
          ref={textareaRef}
          id="prompt-tpl"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScrollToTextarea}
          onBlur={() => setAc(null)}
          spellCheck={false}
          autoComplete="off"
          placeholder="Type {{ to pick a variable — e.g. {{files}} …"
          className={cn(
            EDITOR_CLASS,
            'relative block resize-y overflow-auto rounded-md border border-input bg-transparent text-transparent caret-blue-500 outline-none selection:bg-blue-500/25',
          )}
          style={{ WebkitTextFillColor: 'transparent' }}
        />

        {/* Hidden ruler used to measure the caret for the autocomplete anchor. */}
        <div
          ref={measureRef}
          aria-hidden
          className={cn(EDITOR_CLASS, 'invisible pointer-events-none absolute inset-0 overflow-hidden')}
        />

        {ac !== null && acOptions.length > 0 && (
          <div
            className="absolute z-30 flex flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
            style={{ left: menuLeft, top: menuTop, width: 220 }}
          >
            <div className="max-h-44 overflow-y-auto p-1">
              {acOptions.map((v, index) => (
                <button
                  key={v.name}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => acceptAutocomplete(v.name)}
                  onMouseEnter={() => setAc((prev) => (prev === null ? prev : { ...prev, index }))}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
                    index === ac.index ? 'bg-accent text-accent-foreground' : '',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Braces className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{v.label ?? v.name}</span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                      {'{{'}{v.name}{'}}'}
                    </span>
                  </span>
                  {index === ac.index && <CornerDownLeft className="size-3 shrink-0 text-muted-foreground/70" />}
                </button>
              ))}
            </div>
            <div className="border-t bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
              ↑ ↓ to select · Enter to complete · Esc to dismiss
            </div>
          </div>
        )}
      </div>

      {(unusedVariables.length > 0 || orphanPlaceholders.length > 0) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {unusedVariables.map((v) => (
            <span key={v.name} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
              {'{'}{'{'}{v.name}{'}'}{'}'} defined but not placed
            </span>
          ))}
          {orphanPlaceholders.map((name) => (
            <span key={name} className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-500">
              {'{'}{'{'}{name}{'}'}{'}'} has no variable
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
