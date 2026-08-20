import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUiSocket } from '@/lib/useUiSocket'
import { runTitle } from '@/lib/runTitle'
import { ModelSelect } from '@/components/ModelSelect'
import { consumeRestored } from '@/lib/scrollRestoration'
import { useSearchParams } from '@/lib/useLocation'
import { navigate } from '@/lib/useLocation'
import { CheckCircle2, CircleAlert, CircleStop, ArrowLeft, ChevronRight, Loader2, Lock, MessageCircle, MoreHorizontal, RotateCcw, Send, Wrench, XCircle } from 'lucide-react'

interface RunPageProps {
  runId: string
  conn: 'connecting' | 'open' | 'closed'
}

export function RunPage({ runId, conn }: RunPageProps) {
  const { runs, sendSkillReply, retryRun, requestSkillSnapshot, setRunStatus } = useUiSocket()
  const run = runs[runId]
  // Optional "back to" target (e.g. a loop detail) passed as ?from= — shown
  // as a back arrow so you can return to whatever launched this run.
  const params = useSearchParams()
  const backTo = params.get('from')
  // Per-run model override for retry/resume. Until the user touches the
  // picker it follows the run's own model (so a naive retry re-runs on the
  // failing model — switching away is one pick); "Default (header picker)"
  // explicitly stops overriding.
  const [override, setOverride] = useState<string | null>(null)
  const [overrideTouched, setOverrideTouched] = useState(false)
  useEffect(() => {
    setOverride(null)
    setOverrideTouched(false)
  }, [runId])

  // Late join / page reload — fetch the authoritative transcript. Keep
  // retrying while the run is still unknown and the socket is up: the first
  // attempt can race the backend's "start" broadcast (or a reconnecting
  // socket), and a dropped snapshot must not leave the page spinning forever.
  useEffect(() => {
    if (run !== undefined || conn !== 'open') return
    requestSkillSnapshot(runId)
    const timer = setInterval(() => requestSkillSnapshot(runId), 1500)
    return () => clearInterval(timer)
  }, [runId, run, conn, requestSkillSnapshot])

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (el === null) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    const el = scrollRef.current
    if (
      el !== null &&
      stickToBottom.current &&
      !consumeRestored(location.pathname + location.search)
    ) {
      el.scrollTop = el.scrollHeight
    }
  }, [run?.entries, run?.status])

  const status = run?.status ?? 'running'
  const running = status === 'running'
  const entries = useMemo(() => run?.entries ?? EMPTY_ENTRIES, [run])
  const tools = useMemo(() => run?.tools ?? EMPTY_TOOLS, [run])
  // Index of the last assistant entry — the one that may still be streaming.
  const lastAssistantIdx = useMemo(() => {
    let last = -1
    for (let i = 0; i < entries.length; i++) if (entries[i]?.role === 'assistant') last = i
    return last
  }, [entries])
  // Index of the last user prompt with real text — the ONLY one that can be
  // retried. The retry control lives under that bubble.
  const lastUserIdx = useMemo(() => {
    let last = -1
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]?.role === 'user' && entries[i].text.trim() !== '') last = i
    }
    return last
  }, [entries])

  const canSend = run !== undefined && conn === 'open' && !running

  const submit = (): void => {
    if (!canSend || draft.trim() === '') return
    sendSkillReply(runId, draft, overrideTouched ? override ?? undefined : undefined)
    setDraft('')
    const el = textareaRef.current
    if (el !== null) el.style.height = 'auto'
  }

  // Re-run the last user prompt. The model override (when the user picked
  // or switched one) is the model the regenerated answer runs on.
  const retry = (): void => {
    if (!canSend) return
    retryRun(runId, overrideTouched ? override ?? undefined : undefined)
  }
  const selectedModel = overrideTouched ? override : (run?.model ?? null)

  const statusMeta =
    status === 'done'
      ? { label: 'done', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 }
      : status === 'awaiting'
        ? { label: 'awaiting answer', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: MessageCircle }
        : status === 'interrupted'
          ? { label: 'interrupted', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', Icon: CircleAlert }
          : status === 'error'
            ? { label: 'error', className: 'bg-red-500/15 text-red-600 dark:text-red-400', Icon: XCircle }
            : { label: 'running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', Icon: Loader2 }
  const StatusIcon = statusMeta.Icon

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        {backTo !== null && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            title="Back"
            aria-label="Back"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <h1 className="truncate text-sm font-semibold">{run === undefined ? 'Skill run' : runTitle(run)}</h1>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}
        >
          <StatusIcon className={`size-3 ${running ? 'animate-spin' : ''}`} />
          {statusMeta.label}
        </span>
        {run !== undefined && !running && (
          <div className="w-44 shrink-0">
            <ModelSelect
              conn={conn}
              value={selectedModel}
              onChange={(id) => {
                setOverride(id)
                setOverrideTouched(true)
              }}
            />
          </div>
        )}
        {run !== undefined && (
          <>
            {running && (
              <Button
                size="xs"
                variant="outline"
                className="border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500 dark:border-red-500/40"
                onClick={() => setRunStatus(runId, 'interrupted')}
                disabled={conn !== 'open'}
                title="Force stop — abort the agent and mark the run interrupted"
              >
                <CircleStop className="size-3" />
                Stop
              </Button>
            )}
            <RunStatusMenu runId={runId} status={status} conn={conn} setRunStatus={setRunStatus} />
          </>
        )}
      </header>

      <div ref={scrollRef} onScroll={handleScroll} data-scroll-region className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-3 p-4">
          {run === undefined ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              {conn === 'open' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <p>Starting agent…</p>
                </>
              ) : (
                <>
                  <p>Not connected to the UI router</p>
                  <p className="max-w-md text-xs text-muted-foreground/80">
                    Start /montflow in a pi session for this project, then reload this page.
                  </p>
                </>
              )}
            </div>
          ) : (
            entries.map((entry, index) => {
              // Skip empty user bubbles (e.g. the router's not-found error run).
              if (entry.role === 'user' && entry.text.trim() === '') return null
              const turnTools = tools.filter((tool) => tool.turn === index)
              return (
                <Fragment key={index}>
                  {entry.role === 'assistant' && turnTools.length > 0 && (
                    <ToolActivityGroup tools={turnTools} />
                  )}
                  <RunEntry
                    entry={entry}
                    streaming={running && entry.role === 'assistant' && index === lastAssistantIdx}
                    onRetry={canSend && entry.role === 'user' && index === lastUserIdx ? retry : undefined}
                  />
                </Fragment>
              )
            })
          )}
        </div>
      </div>

      <footer className="border-t p-3">
        <div className="mx-auto flex w-full max-w-5xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              const el = textareaRef.current
              if (el !== null) {
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 80)}px`
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            disabled={!canSend}
            rows={1}
            placeholder={
              running
                ? 'Agent is working — input is locked until it finishes…'
                : run === undefined
                  ? conn === 'open'
                    ? 'Starting agent…'
                    : 'Not connected to the UI router…'
                  : status === 'awaiting'
                    ? 'The agent asked a question — answer to continue (Enter to send)'
                    : status === 'interrupted'
                      ? 'The run was interrupted — answer to resume it (Enter to send)'
                      : conn !== 'open'
                        ? 'Not connected to the UI router…'
                        : 'Answer the agent — or ask it to refine the skill (Enter to send)'
            }
            className="max-h-20 min-h-9 flex-1 resize-none overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button size="icon" onClick={submit} disabled={!canSend} title="Send (Enter)">
            {running ? <Lock className="size-4" /> : <Send className="size-4" />}
          </Button>
        </div>
      </footer>
    </main>
  )
}

const EMPTY_ENTRIES: Array<{ role: 'user' | 'assistant'; text: string }> = []
const EMPTY_TOOLS: Array<ToolCall> = []

/**
 * Header kebab menu for manual run-status control: force-stops a run stuck
 * in "running" (aborts the agent) or overrides the status of any run whose
 * lifecycle is wrong (e.g. one that never finished). The backend persists
 * the change and broadcasts it to every tab.
 */
function RunStatusMenu({
  runId,
  status,
  conn,
  setRunStatus,
}: {
  runId: string
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error'
  conn: 'connecting' | 'open' | 'closed'
  setRunStatus: (runId: string, status: 'done' | 'error' | 'interrupted') => void
}) {
  const canEdit = conn === 'open'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" title="Run actions" disabled={!canEdit}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Run status</DropdownMenuLabel>
        {status === 'running' && (
          <DropdownMenuItem variant="destructive" onSelect={() => setRunStatus(runId, 'interrupted')}>
            <CircleStop className="size-4" />
            Force stop
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={status === 'done'} onSelect={() => setRunStatus(runId, 'done')}>
          <CheckCircle2 className="size-4" />
          Mark as done
        </DropdownMenuItem>
        <DropdownMenuItem disabled={status === 'error'} onSelect={() => setRunStatus(runId, 'error')}>
          <XCircle className="size-4" />
          Mark as error
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={status === 'interrupted' || status === 'running'}
          onSelect={() => setRunStatus(runId, 'interrupted')}
        >
          <CircleAlert className="size-4" />
          Mark as interrupted
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RunEntry({
  entry,
  streaming,
  onRetry,
}: {
  entry: { role: 'user' | 'assistant'; text: string }
  streaming: boolean
  /** Shown under the latest user prompt — re-runs just that prompt (retry/regenerate). */
  onRetry?: () => void
}) {
  if (entry.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1 pl-12">
        <div className="w-full rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/15 dark:text-sky-100">
          <p className="whitespace-pre-wrap">{entry.text}</p>
        </div>
        {onRetry !== undefined && (
          <button
            type="button"
            onClick={onRetry}
            title="Re-run this prompt only — its answer is regenerated; pick a model in the header to switch models first"
            aria-label="Retry this prompt"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            Retry
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="w-full rounded-lg border bg-card px-3 py-2">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
        </div>
        {streaming && (
          <span className="mt-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/70" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool-call activity — one tool call as recorded on a run.
// ---------------------------------------------------------------------------

interface ToolCall {
  name: string
  status: 'running' | 'done' | 'error'
  turn: number
  /** Tool-call arguments (absent for legacy runs). */
  args?: unknown
}

const asRecord = (args: unknown): Record<string, unknown> =>
  typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {}

const strOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

const quoted = (s: string): string => (/[\s'"]/.test(s) ? `'${s.replace(/'/g, "\\'")}'` : s)

const prettyJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** Stable per-position id so expansion/detail state survives as a run streams. */
const callId = (tool: ToolCall, index: number): string => `${tool.turn}:${tool.name}:${index}`

/** Edit-count of an edit call (models sometimes send edits as a JSON string). */
const editCount = (args: Record<string, unknown>): number => {
  const edits = args.edits
  if (Array.isArray(edits)) return edits.length
  if (typeof edits === 'string') {
    try {
      const parsed: unknown = JSON.parse(edits)
      return Array.isArray(parsed) ? parsed.length : 1
    } catch {
      return 1
    }
  }
  return 1
}

/**
 * Compact one-line summary of a tool call — what the agent asked for, e.g.
 * `grep 'pattern' src/` or `read packages/a/src/index.ts (lines 1-80)`. Shown
 * on collapsed group rows' expanded item lists.
 */
const summarizeCall = (tool: ToolCall): string => {
  const args = asRecord(tool.args)
  const path = strOf(args.path) ?? strOf(args.file_path)
  switch (tool.name) {
    case 'read': {
      const base = `read ${path ?? '<file>'}`
      if (typeof args.offset === 'number' || typeof args.limit === 'number') {
        const from = typeof args.offset === 'number' ? args.offset : 1
        const to =
          typeof args.offset === 'number' && typeof args.limit === 'number'
            ? args.offset + args.limit - 1
            : typeof args.limit === 'number'
              ? from + args.limit - 1
              : undefined
        return `${base} (lines ${from}${to !== undefined ? `-${to}` : '+'})`
      }
      return base
    }
    case 'bash':
      return `bash ${quoted(strOf(args.command) ?? '<command>')}`
    case 'grep': {
      const pattern = quoted(strOf(args.pattern) ?? '<pattern>')
      const target = path ?? strOf(args.glob) ?? '.'
      const flags = [args.ignoreCase === true ? '-i' : '', args.literal === true ? '-F' : '']
        .filter((f) => f !== '')
        .join(' ')
      return `grep ${flags}${flags !== '' ? ' ' : ''}${pattern} ${target}`.trim()
    }
    case 'find':
    case 'glob': {
      const pattern = quoted(strOf(args.pattern) ?? '<pattern>')
      return `${tool.name} ${pattern} ${path ?? '.'}`.trim()
    }
    case 'write':
      return `write ${path ?? '<file>'}`
    case 'edit': {
      const n = editCount(args)
      return `edit ${path ?? '<file>'} (${n} ${n === 1 ? 'edit' : 'edits'})`
    }
    default: {
      const text = strOf(args.command) ?? strOf(args.pattern)
      const tail = text !== undefined ? quoted(text) : tool.args !== undefined ? prettyJson(tool.args) : ''
      return `${tool.name}${tail !== '' ? ` ${tail}` : ''}`
    }
  }
}

/**
 * Full detail of one tool call — the command line plus the complete raw
 * arguments (content of a write, old/new text of edits, …).
 */
const describeCall = (tool: ToolCall): string => {
  if (tool.args === undefined) return `${tool.name} (no arguments captured)`
  if (typeof tool.args === 'string' || Array.isArray(tool.args)) {
    return `${summarizeCall(tool)}\n${prettyJson(tool.args)}`
  }
  const args = asRecord(tool.args)
  const summary = summarizeCall(tool)
  const extra: string[] = []
  const content = strOf(args.content)
  if (content !== undefined) {
    extra.push(`content (${content.length} chars):\n${content}`)
  }
  const edits = args.edits
  if (Array.isArray(edits)) {
    extra.push(
      edits
        .map((e, i) => {
          const rec = asRecord(e)
          return `edit ${i + 1}:\nold: ${strOf(rec.oldText) ?? ''}\nnew: ${strOf(rec.newText) ?? ''}`
        })
        .join('\n---\n'),
    )
  }
  const remaining: Record<string, unknown> = { ...args }
  delete remaining.content
  delete remaining.edits
  delete remaining.command
  delete remaining.pattern
  delete remaining.path
  delete remaining.file_path
  delete remaining.oldText
  delete remaining.newText
  if (Object.keys(remaining).length > 0) {
    extra.push(`other args: ${prettyJson(remaining)}`)
  }
  return [summary, ...extra].join('\n\n')
}

/**
 * Collapse consecutive same-name tool calls into a single expandable row
 * (`grep ×3`, `read ×8`). Click the group to reveal the ordered call list;
 * click a call to reveal its full actual command/arguments.
 */
function ToolActivityGroup({ tools }: { tools: readonly ToolCall[] }) {
  const groups = useMemo(() => {
    const groups: ToolCall[][] = []
    for (const tool of tools) {
      const last = groups[groups.length - 1]
      if (last !== undefined && last[last.length - 1]?.name === tool.name) last.push(tool)
      else groups.push([tool])
    }
    return groups
  }, [tools])

  return (
    <div className="space-y-0.5">
      {groups.map((group, groupIndex) => (
        <ToolGroupRow key={groupIndex} group={group} />
      ))}
    </div>
  )
}

function ToolGroupRow({ group }: { group: ToolCall[] }) {
  const [listOpen, setListOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const name = group[0]?.name ?? 'tool'
  const count = group.length
  const running = group.some((tool) => tool.status === 'running')
  const errors = group.filter((tool) => tool.status === 'error').length
  const multiple = count > 1

  // Single-call rows: the header itself toggles the command detail (there is
  // no ordering to reveal first). Multi-call rows expand the ordered list.
  const toggleHeader = (): void => {
    if (multiple) {
      setListOpen((open) => !open)
    } else {
      toggleDetail(group[0]!, 0)
    }
  }
  const toggleDetail = (tool: ToolCall, index: number): void =>
    setDetailId((current) => (current === callId(tool, index) ? null : callId(tool, index)))
  const showDetail = (tool: ToolCall, index: number): boolean => detailId === callId(tool, index)

  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={toggleHeader}
        title={multiple ? `Show ${count} ${name} calls in order` : 'Show command'}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/70 hover:text-foreground"
      >
        {multiple && (
          <ChevronRight
            className={`size-3 shrink-0 transition-transform ${listOpen ? 'rotate-90' : ''}`}
          />
        )}
        <Wrench className="size-3 shrink-0" />
        <span className="font-mono font-medium">{name}</span>
        {multiple && (
          <span className="rounded bg-muted px-1 font-mono font-semibold text-muted-foreground">
            ×{count}
          </span>
        )}
        {running && <Loader2 className="size-3 animate-spin" />}
        {errors > 0 && (
          <span className="font-medium text-red-500">{errors > 1 ? `${errors} errors` : 'error'}</span>
        )}
      </button>

      {(listOpen || !multiple) && (
        <div className="mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
          {group.map((tool, index) => (
            <div key={callId(tool, index)}>
              <button
                type="button"
                onClick={() => toggleDetail(tool, index)}
                title="Show the full command/arguments"
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                {multiple && <span className="shrink-0 opacity-60">{index + 1}.</span>}
                <span className="truncate">{summarizeCall(tool)}</span>
                {tool.status === 'running' && <Loader2 className="size-3 shrink-0 animate-spin" />}
                {tool.status === 'error' && <span className="shrink-0 font-medium text-red-500">error</span>}
                <ChevronRight
                  className={`ml-auto size-3 shrink-0 transition-transform ${showDetail(tool, index) ? 'rotate-90' : ''}`}
                />
              </button>
              {showDetail(tool, index) && (
                <pre className="my-1 max-h-80 overflow-auto rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/90">
                  {describeCall(tool)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
