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
import { consumeRestored } from '@/lib/scrollRestoration'
import { CheckCircle2, CircleAlert, CircleStop, Loader2, Lock, MessageCircle, MoreHorizontal, Send, Wrench, XCircle } from 'lucide-react'

interface RunPageProps {
  runId: string
  conn: 'connecting' | 'open' | 'closed'
}

export function RunPage({ runId, conn }: RunPageProps) {
  const { runs, sendSkillReply, requestSkillSnapshot, setRunStatus } = useUiSocket()
  const run = runs[runId]

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

  const canSend = run !== undefined && conn === 'open' && !running

  const submit = (): void => {
    if (!canSend || draft.trim() === '') return
    sendSkillReply(runId, draft)
    setDraft('')
    const el = textareaRef.current
    if (el !== null) el.style.height = 'auto'
  }

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
        <h1 className="truncate text-sm font-semibold">{run === undefined ? 'Skill run' : runTitle(run)}</h1>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusMeta.className}`}
        >
          <StatusIcon className={`size-3 ${running ? 'animate-spin' : ''}`} />
          {statusMeta.label}
        </span>
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
                    <div className="space-y-1">
                      {turnTools.map((tool, toolIndex) => (
                        <div
                          key={toolIndex}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <Wrench className="size-3 shrink-0" />
                          <span className="font-mono font-medium">{tool.name}</span>
                          {tool.status === 'running' && <Loader2 className="size-3 animate-spin" />}
                          {tool.status === 'error' && <span className="text-red-500">error</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <RunEntry
                    entry={entry}
                    streaming={running && entry.role === 'assistant' && index === lastAssistantIdx}
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
const EMPTY_TOOLS: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number }> = []

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
}: {
  entry: { role: 'user' | 'assistant'; text: string }
  streaming: boolean
}) {
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end pl-12">
        <div className="w-full rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/15 dark:text-sky-100">
          <p className="whitespace-pre-wrap">{entry.text}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start pr-12">
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
