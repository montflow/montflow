import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiSocket } from '@/lib/useUiSocket'
import { useWorkspaces } from '@/lib/useWorkspaces'
import { workspaceUrl } from '@/components/LandingPage'
import { navigate } from '@/lib/useLocation'
import type { UiMsg } from '@/protocol'
import { ArrowLeft, ChevronDown, Loader2, Lock, Pencil, Send, Wrench } from 'lucide-react'

interface SessionPageProps {
  sessionId: string
  conn: 'connecting' | 'open' | 'closed'
}

/** Stable empty list — avoids a new array identity on every render. */
const EMPTY_MESSAGES: UiMsg[] = []

/** Consecutive tool calls with the same name collapse into one row ("bash ×3"). */
interface ToolGroup {
  kind: 'tool-group'
  firstId: string
  name: string
  count: number
  running: boolean
  hasError: boolean
  texts: string[]
}

type Item = UiMsg | ToolGroup

const toItems = (messages: UiMsg[]): Item[] => {
  const items: Item[] = []
  for (const message of messages) {
    if (message.kind === 'tool') {
      const name = message.toolName ?? 'tool'
      const last = items[items.length - 1]
      if (last !== undefined && last.kind === 'tool-group' && last.name === name) {
        last.count += 1
        if (message.status === 'running') last.running = true
        if (message.isError) last.hasError = true
        if (message.text.trim() !== '') last.texts.push(message.text)
        continue
      }
      items.push({
        kind: 'tool-group',
        firstId: message.id,
        name,
        count: 1,
        running: message.status === 'running',
        hasError: message.isError === true,
        texts: message.text.trim() !== '' ? [message.text] : [],
      })
      continue
    }
    // Skip empty assistant bubbles (streaming placeholder or empty result).
    if (message.kind === 'assistant' && message.text.trim() === '' && !message.streaming) continue
    items.push(message)
  }
  return items
}

export function SessionPage({ sessionId, conn }: SessionPageProps) {
  const { state, folders, sendCommand } = useUiSocket()
  const queryClient = useQueryClient()
  const workspaces = useWorkspaces(conn, folders)

  // Resolve the session's folder + workspace from its own id — the session is
  // not tied to a workspace; the workspace is just metadata.
  const folder = useMemo(
    () => folders.find((f) => f.sessionId === sessionId) ?? null,
    [folders, sessionId],
  )
  const workspace = useMemo(
    () => (folder !== null ? (workspaces?.find((w) => w.path === folder.cwd) ?? null) : null),
    [folder, workspaces],
  )
  const workspaceId = workspace?.id ?? null

  const messages = useMemo(
    () => (folder !== null ? (state[folder.id]?.messages ?? EMPTY_MESSAGES) : EMPTY_MESSAGES),
    [state, folder],
  )
  const busy = folder !== null ? (state[folder.id]?.busy ?? false) : false

  const items = useMemo(() => toItems(messages), [messages])

  const [draft, setDraft] = useState('')
  const [showJump, setShowJump] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const stickToBottom = useRef(true)

  // ~20px/line at text-sm — the composer grows to 4 lines, then scrolls.
  const COMPOSER_MAX_HEIGHT = 80

  // Rename
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(folder?.name ?? '')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Keep the rename field in sync with the live session name.
  useEffect(() => {
    if (renameOpen) setRenameValue(folder?.name ?? '')
  }, [renameOpen, folder?.name])

  const saveRename = async (): Promise<void> => {
    const name = renameValue.trim()
    if (name === '' || name === folder?.name) {
      setRenameOpen(false)
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        let message = `HTTP ${res.status}`
        try {
          const data = (await res.json()) as { error?: string }
          if (typeof data.error === 'string') message = data.error
        } catch {
          // non-JSON error body
        }
        throw new Error(message)
      }
      setRenameOpen(false)
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error))
    } finally {
      setRenaming(false)
    }
  }

  const handleDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value)
    const el = textareaRef.current
    if (el !== null) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
    }
  }

  const resetComposer = (): void => {
    const el = textareaRef.current
    if (el !== null) el.style.height = 'auto'
  }

  const handleScroll = (): void => {
    const el = scrollRef.current
    if (el === null) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickToBottom.current = atBottom
    setShowJump(!atBottom)
  }

  const jumpToBottom = (): void => {
    const el = scrollRef.current
    if (el !== null) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }

  // Follow new content while the user is near the bottom; stay put if they
  // scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current
    if (el !== null && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // When the agent finishes a turn (busy true → false), it may have written
  // skills directly — refresh the skill queries for this session's workspace.
  const prevBusy = useRef(false)
  useEffect(() => {
    if (prevBusy.current && !busy && workspaceId !== null) {
      void queryClient.invalidateQueries({ queryKey: ['skills', workspaceId] })
    }
    prevBusy.current = busy
  }, [busy, queryClient, workspaceId])

  const canSend = folder !== null && conn === 'open' && !busy

  const submit = (): void => {
    if (!canSend || folder === null || draft.trim() === '') return
    sendCommand(folder.id, { type: 'prompt', text: draft })
    setDraft('')
    resetComposer()
  }

  const goToWorkspace = (): void => {
    if (workspaceId !== null) navigate(workspaceUrl(workspaceId))
  }

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={goToWorkspace}
          disabled={workspaceId === null}
          title={workspaceId === null ? 'No workspace for this session' : 'Go to workspace'}
        >
          <ArrowLeft className="size-4" />
          Go to workspace
        </Button>
        <h1 className="truncate text-sm font-semibold">{folder?.name ?? 'Session'}</h1>
        {folder !== null && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => setRenameOpen(true)}
            title="Rename session"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Agent is working…
            </span>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl space-y-3 p-4">
            {folder === null ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>Session is not connected right now.</p>
                <p className="max-w-md text-xs text-muted-foreground/80">
                  Start the session with /montflow in its project and it will appear here.
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>No messages yet.</p>
                <p className="max-w-md text-xs text-muted-foreground/80">
                  Agentic skill runs land here — you can watch the agent work and answer back when
                  it asks you something. Type below to start a conversation.
                </p>
              </div>
            ) : (
              items.map((item) =>
                item.kind === 'tool-group' ? (
                  <ToolRow key={item.firstId} group={item} />
                ) : (
                  <MessageBubble key={item.id} message={item} />
                ),
              )
            )}
          </div>
        </div>
        {showJump && items.length > 0 && (
          <button
            type="button"
            onClick={jumpToBottom}
            title="Scroll to bottom"
            className="absolute bottom-4 right-4 z-10 flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-md transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
        )}
      </div>

      <footer className="border-t p-3">
        <div className="mx-auto flex w-full max-w-5xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            disabled={!canSend}
            rows={1}
            placeholder={
              busy
                ? 'Agent is working — input is locked until it finishes…'
                : folder === null
                  ? 'Session not connected…'
                  : conn !== 'open'
                    ? 'Not connected to the UI router…'
                    : 'Message the session (Enter to send, Shift+Enter for newline)'
            }
            className="max-h-20 min-h-9 flex-1 resize-none overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button size="icon" onClick={submit} disabled={!canSend} title="Send (Enter)">
            {busy ? <Lock className="size-4" /> : <Send className="size-4" />}
          </Button>
        </div>
      </footer>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              Sessions have their own identity — this name is just for you and persists across
              restarts.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !renaming) {
                event.preventDefault()
                void saveRename()
              }
            }}
            placeholder="Session name"
            maxLength={80}
          />
          {renameError !== null && <p className="text-xs text-red-500">{renameError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={() => void saveRename()} disabled={renaming}>
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ToolRow({ group }: { group: ToolGroup }) {
  const label = group.count > 1 ? `${group.name} ×${group.count}` : group.name

  // No output, no error → a compact inline chip instead of an empty box.
  if (group.texts.length === 0 && !group.hasError) {
    return (
      <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Wrench className="size-3 shrink-0" />
        <span className="font-medium">{label}</span>
        {group.running && <Loader2 className="size-3 animate-spin" />}
      </div>
    )
  }

  return (
    <details className="w-fit rounded-lg border bg-muted/30 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <Wrench className="size-3 shrink-0" />
        <span className="font-medium">{label}</span>
        {group.running && <Loader2 className="size-3 animate-spin" />}
        {group.hasError && <span className="text-red-500">error</span>}
      </summary>
      {group.texts.length > 0 && (
        <div className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto">
          {group.texts.map((text, index) => (
            <pre
              key={index}
              className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              {text}
            </pre>
          ))}
        </div>
      )}
    </details>
  )
}

function MessageBubble({ message }: { message: UiMsg }) {
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    )
  }

  if (message.kind === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="w-full rounded-lg border bg-card px-3 py-2">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
          {message.streaming && <StreamingCursor />}
        </div>
      </div>
    )
  }

  return (
    <p className="text-center text-[11px] italic text-muted-foreground">{message.text}</p>
  )
}

function StreamingCursor() {
  return <span className="mt-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/70" />
}
