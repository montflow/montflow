import { useCallback, useSyncExternalStore } from 'react'
import { queryClient } from './queryClient'
import {
  contentToText,
  contentToToolCalls,
  truncate,
  type AssistantMessageEvent,
  type ClientCommand,
  type EventToolExecution,
  type FolderInfo,
  type FolderState,
  type HelloPayload,
  type ServerMessage,
  type Toast,
  type ToolRun,
  type UiMsg,
} from '../protocol'

interface UiSocketState {
  conn: 'connecting' | 'open' | 'closed'
  folders: FolderInfo[]
  selected: string | null
  setSelected: (folder: string | null) => void
  state: Record<string, FolderState>
  port: number | null
  toasts: Toast[]
  sendCommand: (folder: string, command: ClientCommand) => void
  dismissToast: (id: string) => void
  /** Agentic skill runs (isolated agent sessions) by run id. */
  runs: Record<string, SkillRunState>
  /**
   * One-shot AI-input text fills by id (NOT runs — ephemeral, nothing
   * persisted). Only the latest text per id; used by the AI-input modal.
   */
  textGens: Record<string, TextGenState>
  /** Notification-center entries (run lifecycle events). */
  notifications: NotificationItem[]
  dismissNotification: (id: string) => void
  markNotificationsRead: () => void
  clearNotifications: () => void
  /** Send a follow-up answer to a run's agent (folder resolved router-side). */
  sendSkillReply: (runId: string, text: string, model?: string) => void
  /** Re-run the last user prompt (retry after error/no-response, or regenerate a finished answer). */
  retryRun: (runId: string, model?: string) => void
  /** Fetch the full transcript for a run (late join / page reload). */
  requestSkillSnapshot: (runId: string) => void
  /**
   * Force-stop or manually override a run's status (folder resolved
   * router-side). Aborts the agent when it is still running.
   */
  setRunStatus: (runId: string, status: 'done' | 'error' | 'interrupted') => void
  /** TEMP mock: inject a run into the socket store so the loop mock can populate agent run pages. */
  seedMockRun: (id: string, run: SkillRunState) => void
}

/** One agentic skill run as seen by the browser. */
export interface SkillRunState {
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error'
  folder: string
  workspaceId: string
  entries: Array<{ role: 'user' | 'assistant'; text: string }>
  /** Tool activity in order of appearance (`turn` = assistant entry index). */
  tools: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number; args?: unknown }>
  /** Short generated title (opencode big-pickle); undefined until ready. */
  title?: string
  /** Model the run's agent runs on (live runs; undefined after router restarts). */
  model?: string
}

/** One AI-input text fill as seen by the browser. */
export interface TextGenState {
  status: 'running' | 'done' | 'error'
  /** Accumulated streamed text (final answer on done/error). */
  text: string
}

/**
 * One entry in the header notification center — emitted when an agentic run
 * changes state (started, finished, needs your answer, errored). Clicking an
 * entry navigates to the run (`runId`).
 */
export interface NotificationItem {
  id: string
  folder: string | null
  level: 'info' | 'warning' | 'error'
  message: string
  ts: number
  /** Run id for run-lifecycle notifications (click → /runs/<id>/). */
  runId?: string
  read: boolean
}

/**
 * Notification message per run status transition (`prev|next`, '' = none).
 * Follow-up answers move awaiting/error/interrupted → running and are
 * reported as "resumed" rather than "started".
 */
const RUN_TRANSITIONS: Record<string, { message: string; level: NotificationItem['level'] }> = {
  '|running': { message: 'Agentic run started', level: 'info' },
  'running|awaiting': { message: 'Agentic run needs your answer', level: 'warning' },
  'running|done': { message: 'Agentic run finished', level: 'info' },
  'running|error': { message: 'Agentic run errored', level: 'error' },
  'running|interrupted': { message: 'Agentic run interrupted', level: 'warning' },
  'awaiting|running': { message: 'Agentic run resumed', level: 'info' },
  'awaiting|done': { message: 'Agentic run finished', level: 'info' },
  'awaiting|error': { message: 'Agentic run errored', level: 'error' },
  'interrupted|running': { message: 'Agentic run resumed', level: 'info' },
  'error|running': { message: 'Agentic run retried', level: 'info' },
  'done|running': { message: 'Agentic run regenerating', level: 'info' },
}

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

let uidCounter = 0
const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`

const emptyFolder = (): FolderState => ({
  hello: null,
  messages: [],
  tools: [],
  busy: false,
})

// ---------------------------------------------------------------------------
// Module-level connection controller
// ---------------------------------------------------------------------------
//
// The app mounts MULTIPLE useUiSocket() instances (App, RunPage, SessionPage,
// useLoops, AiInput, dialogs…). Every instance used to open its OWN WebSocket,
// and each socket's message handler independently applied skillGen deltas to
// the SHARED run store — so with N sockets open, every streaming delta was
// appended N times to the same assistant entry, corrupting the transcript
// (overlapping duplicated text on the run page). Fix: open ONE WebSocket at
// module scope and have every instance read from a single reactive store.
// ---------------------------------------------------------------------------

interface SocketSnapshot {
  conn: 'connecting' | 'open' | 'closed'
  folders: FolderInfo[]
  selected: string | null
  state: Record<string, FolderState>
  port: number | null
  toasts: Toast[]
  textGens: Record<string, TextGenState>
  notifications: NotificationItem[]
  runs: Record<string, SkillRunState>
}

let store: SocketSnapshot = {
  conn: 'connecting',
  folders: [],
  selected: null,
  state: {},
  port: null,
  toasts: [],
  textGens: {},
  notifications: [],
  runs: {},
}
const listeners = new Set<() => void>()
const emit = (): void => {
  for (const listener of listeners) listener()
}
const update = (fn: (s: SocketSnapshot) => SocketSnapshot): void => {
  const next = fn(store)
  if (next === store) return
  store = next
  emit()
}
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getSnapshot = (): SocketSnapshot => store

/**
 * TEMP mock: seed a fake agent run into the shared store from module scope.
 * The loop mock (useLoops) advances its stages on timers, so it must be able
 * to push updates to any mounted RunPage without going through a live
 * component hook — otherwise an open run page goes stale until you leave and
 * re-enter it.
 */
export const seedMockRunGlobal = (id: string, run: SkillRunState): void => {
  update((s) => (s.runs[id] === run ? s : { ...s, runs: { ...s.runs, [id]: run } }))
}

// --- helpers that mutate the store ---------------------------------------

const patchFolder = (folder: string, patch: (f: FolderState) => FolderState): void => {
  update((s) => ({ ...s, state: { ...s.state, [folder]: patch(s.state[folder] ?? emptyFolder()) } }))
}

const pushToast = (folder: string | null, message: string, level: Toast['level'] = 'info'): void => {
  const id = uid('toast')
  update((s) => ({ ...s, toasts: [...s.toasts.slice(-4), { id, folder, message, level }] }))
  setTimeout(() => update((s) => (s.toasts.some((t) => t.id === id) ? { ...s, toasts: s.toasts.filter((t) => t.id !== id) } : s)), 6000)
}

const dismissToast = (id: string): void => {
  update((s) => (s.toasts.some((t) => t.id === id) ? { ...s, toasts: s.toasts.filter((t) => t.id !== id) } : s))
}

/** Newest-first, capped at 50 entries so the center can't grow unbounded. */
const pushNotification = (
  folder: string | null,
  message: string,
  level: NotificationItem['level'] = 'info',
  runId?: string,
): void => {
  const id = uid('notif')
  update((s) => ({
    ...s,
    notifications: [{ id, folder, message, level, ts: Date.now(), runId, read: false }, ...s.notifications].slice(0, 50),
  }))
}

const dismissNotification = (id: string): void => {
  update((s) => ({ ...s, notifications: s.notifications.filter((n) => n.id !== id) }))
}

const markNotificationsRead = (): void => {
  update((s) =>
    s.notifications.some((n) => !n.read)
      ? { ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }
      : s,
  )
}

const clearNotifications = (): void => {
  update((s) => (s.notifications.length === 0 ? s : { ...s, notifications: [] }))
}

// Last seen status per run id — drives the transition notifications.
const prevRunStatus = new Map<string, SkillRunState['status']>()

// Merge a skillGen chunk into the run state.
const applySkillGen = (msg: Extract<ServerMessage, { type: 'skillGen' }>): void => {
  // Notify on real run state transitions (started / finished / awaiting
  // answer / errored). Snapshot replays only seed the tracker — a late
  // join must not re-notify, but the next real transition still fires.
  if (msg.phase === 'snapshot') {
    prevRunStatus.set(msg.runId, msg.status)
  } else {
    const prev = prevRunStatus.get(msg.runId)
    if (prev !== msg.status) {
      prevRunStatus.set(msg.runId, msg.status)
      const transition = RUN_TRANSITIONS[`${prev ?? ''}|${msg.status}`]
      if (transition !== undefined) {
        pushNotification(msg.folder, transition.message, transition.level, msg.runId)
      }
    }
  }
  update((s) => {
    const current = s.runs[msg.runId]
    // start / snapshot always carry the full transcript; an error for a
    // run we've never seen (e.g. the router replying "no live session")
    // must still materialize the run so the page shows the error instead
    // of "Loading run…" forever.
    if (msg.phase === 'start' || msg.phase === 'snapshot' || (msg.phase === 'error' && current === undefined)) {
      return {
        ...s,
        runs: {
          ...s.runs,
          [msg.runId]: {
            status: msg.status,
            folder: msg.folder,
            workspaceId: msg.workspaceId,
            entries: [...(msg.entries ?? [])],
            tools: [...(msg.tools ?? [])],
            title: msg.title,
            model: msg.model,
          },
        },
      }
    }
    if (current === undefined) return s // missed the start — snapshot recovers
    if (msg.phase === 'title') {
      // The generated title arrived — patch it in place.
      return { ...s, runs: { ...s.runs, [msg.runId]: { ...current, title: msg.title } } }
    }
    if (msg.phase === 'delta') {
      const entries = current.entries.map((entry, index) =>
        index === msg.entry ? { ...entry, text: entry.text + msg.text } : entry,
      )
      return { ...s, runs: { ...s.runs, [msg.runId]: { ...current, entries } } }
    }
    if (msg.phase === 'tool') {
      const tools = [...current.tools]
      if (msg.status === 'running') {
        tools.push({ name: msg.text, status: 'running', turn: msg.entry, args: msg.toolArgs })
      } else {
        const tool = [...tools].reverse().find((t) => t.name === msg.text && t.status === 'running')
        if (tool !== undefined) {
          // Tool phases only ever carry running/done/error — never awaiting.
          tools[tools.indexOf(tool)] = { ...tool, status: msg.status === 'error' ? 'error' : 'done' }
        }
      }
      return { ...s, runs: { ...s.runs, [msg.runId]: { ...current, tools } } }
    }
    // terminal: done / awaiting / error
    const entries = current.entries.map((entry, index) =>
      index === msg.entry && entry.text === '' ? { ...entry, text: msg.text } : entry,
    )
    if (msg.phase === 'done' && msg.status === 'done') {
      // The agent wrote files — refresh that workspace's queries.
      // Agentic runs can author skills, profiles (PROFILE.md), or
      // review presets — invalidate all three (a run may touch several).
      void queryClient.invalidateQueries({ queryKey: ['skills', msg.workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['profiles', msg.workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['presets', msg.workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['prompts', msg.workspaceId] })
    }
    return { ...s, runs: { ...s.runs, [msg.runId]: { ...current, status: msg.status, entries } } }
  })
}

// --- singleton WebSocket --------------------------------------------------

let ws: WebSocket | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let attempt = 0
let started = false

const connect = (): void => {
  ws = new WebSocket(WS_URL)
  update((s) => (s.conn === 'connecting' ? s : { ...s, conn: 'connecting' }))

  ws.onopen = () => {
    attempt = 0
    update((s) => (s.conn === 'open' ? s : { ...s, conn: 'open' }))
  }

  ws.onmessage = (event) => {
    let msg: ServerMessage
    try {
      msg = JSON.parse(String(event.data)) as ServerMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'folders': {
        update((s) => {
          const selected =
            s.selected !== null && msg.folders.some((f) => f.id === s.selected)
              ? s.selected
              : (msg.folders[0]?.id ?? null)
          const live = new Set(msg.folders.map((f) => f.id))
          const state: Record<string, FolderState> = {}
          for (const key of Object.keys(s.state)) if (live.has(key)) state[key] = s.state[key]
          return { ...s, port: msg.port, folders: msg.folders, selected, state }
        })
        break
      }

      case 'hello':
        applyHello(msg.folder, msg.hello)
        break

      case 'event':
        applyEvent(msg.folder, msg.event)
        break

      case 'notify':
        pushToast(msg.folder, msg.message, msg.level)
        break

      case 'skillChanged': {
        // Another tab/session mutated a skill — refresh every query that
        // holds data for this workspace (list + detail share the prefix).
        void queryClient.invalidateQueries({ queryKey: ['skills', msg.workspaceId] })
        if (msg.kind === 'created') {
          pushToast(msg.folder, `New skill created: ${msg.skillId}`, 'info')
        } else if (msg.kind === 'deleted') {
          pushToast(msg.folder, `Skill deleted: ${msg.skillId}`, 'info')
        }
        break
      }

      case 'profileChanged': {
        void queryClient.invalidateQueries({ queryKey: ['profiles', msg.workspaceId] })
        if (msg.kind === 'created') {
          pushToast(msg.folder, `New profile created: ${msg.profileName}`, 'info')
        } else if (msg.kind === 'deleted') {
          pushToast(msg.folder, `Profile deleted: ${msg.profileName}`, 'info')
        }
        break
      }

      case 'presetChanged': {
        void queryClient.invalidateQueries({ queryKey: ['presets', msg.workspaceId] })
        if (msg.kind === 'created') {
          pushToast(msg.folder, `New preset created: ${msg.presetName}`, 'info')
        } else if (msg.kind === 'deleted') {
          pushToast(msg.folder, `Preset deleted: ${msg.presetName}`, 'info')
        }
        break
      }

      case 'promptChanged': {
        void queryClient.invalidateQueries({ queryKey: ['prompts', msg.workspaceId] })
        if (msg.kind === 'created') {
          pushToast(msg.folder, `New prompt created: ${msg.promptName}`, 'info')
        } else if (msg.kind === 'deleted') {
          pushToast(msg.folder, `Prompt deleted: ${msg.promptName}`, 'info')
        }
        break
      }

      case 'sessionChanged':
        update((s) => {
          const folders = s.folders.map((f) => (f.id === msg.folder ? { ...f, sessionId: msg.sessionId } : f))
          return { ...s, folders }
        })
        break

      case 'modelsChanged':
        void queryClient.invalidateQueries({ queryKey: ['models'] })
        break

      case 'textGen': {
        // One-shot AI-input fill — accumulate deltas; the done/error
        // phases carry the full answer text. No runs, no notifications.
        update((s) => {
          const current = s.textGens[msg.runId]
          if (msg.phase === 'start') {
            return { ...s, textGens: { ...s.textGens, [msg.runId]: { status: msg.status, text: '' } } }
          }
          if (current === undefined) return s // missed the start — done still lands
          if (msg.phase === 'delta') {
            return { ...s, textGens: { ...s.textGens, [msg.runId]: { ...current, text: current.text + msg.text } } }
          }
          return { ...s, textGens: { ...s.textGens, [msg.runId]: { status: msg.status, text: msg.text } } }
        })
        break
      }

      case 'skillGen':
        applySkillGen(msg)
        break

      case 'folderGone':
        update((s) => {
          const folders = s.folders.filter((f) => f.id !== msg.folder)
          const state: Record<string, FolderState> = {}
          for (const key of Object.keys(s.state)) if (key !== msg.folder) state[key] = s.state[key]
          const selected = s.selected === msg.folder ? null : s.selected
          return { ...s, folders, state, selected }
        })
        break
    }
  }

  ws.onclose = () => {
    update((s) => (s.conn === 'closed' ? s : { ...s, conn: 'closed' }))
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      attempt += 1
      connect()
    }, Math.min(1000 * 2 ** attempt, 10000))
  }

  ws.onerror = () => {
    // onclose follows; retry there.
  }
}

/** Start the singleton connection exactly once, on first hook mount. */
const ensureConnected = (): void => {
  if (started) return
  started = true
  connect()
}

const applyHello = (folder: string, hello: HelloPayload): void => {
  patchFolder(folder, () => ({
    hello,
    messages: hello.entries.map(entryToMsg),
    tools: [],
    busy: false,
  }))
}

const applyEvent = (folder: string, event: Record<string, unknown>): void => {
  switch (event.type) {
    case 'agent_start':
      patchFolder(folder, (f) => ({ ...f, busy: true }))
      break
    case 'agent_end':
    case 'agent_settled':
      patchFolder(folder, (f) => ({ ...f, busy: false }))
      break

    case 'message_start': {
      const message = event.message as {
        id?: string
        role?: string
        content?: unknown
        toolName?: string
        toolCallId?: string
        isError?: boolean
      }
      const id = message.id ?? uid('msg')
      const ts = Date.now()
      if (message.role === 'user') {
        const text = contentToText(message.content)
        patchFolder(folder, (f) => ({ ...f, messages: [...f.messages, { id, kind: 'user', text, ts }] }))
      } else if (message.role === 'assistant') {
        const text = contentToText(message.content)
        lastAssistantId.set(folder, id)
        patchFolder(folder, (f) => ({
          ...f,
          messages: [
            ...f.messages,
            { id, kind: 'assistant', text, ts, streaming: true, toolCalls: contentToToolCalls(message.content) },
          ],
        }))
      } else if (message.role === 'toolResult' || message.role === 'tool') {
        const toolCallId = message.toolCallId ?? uid('tool')
        patchFolder(folder, (f) => ({
          ...f,
          messages: [
            ...f.messages,
            {
              id: toolCallId,
              kind: 'tool',
              text: truncate(contentToText(message.content)),
              ts,
              toolName: message.toolName,
              toolCallId,
              isError: message.isError,
              status: message.isError ? 'error' : 'done',
            },
          ],
        }))
      }
      break
    }

    case 'message_update': {
      const evt = event.assistantMessageEvent as AssistantMessageEvent | undefined
      if (!evt) break
      if (evt.type === 'text_delta' && typeof evt.delta === 'string') {
        const id = lastAssistantId.get(folder)
        if (id) {
          patchFolder(folder, (f) => ({
            ...f,
            messages: f.messages.map((m) =>
              m.id === id && m.kind === 'assistant' ? { ...m, text: m.text + evt.delta } : m,
            ),
          }))
        }
      }
      break
    }

    case 'message_end': {
      const message = event.message as {
        id?: string
        role?: string
        content?: unknown
        toolName?: string
        toolCallId?: string
        isError?: boolean
      }
      if (message.role === 'assistant') {
        const id = message.id ?? lastAssistantId.get(folder)
        if (id !== undefined) {
          const text = contentToText(message.content)
          const toolCalls = contentToToolCalls(message.content)
          patchFolder(folder, (f) => ({
            ...f,
            messages: f.messages.map((m) =>
              m.id === id && m.kind === 'assistant'
                ? { ...m, text, streaming: false, toolCalls: toolCalls.length > 0 ? toolCalls : m.toolCalls }
                : m,
            ),
          }))
        }
      } else if (message.role === 'toolResult' || message.role === 'tool') {
        const toolCallId = message.toolCallId
        if (toolCallId) {
          patchFolder(folder, (f) => ({
            ...f,
            messages: f.messages.map((m) =>
              m.id === toolCallId && m.kind === 'tool'
                ? {
                    ...m,
                    text: truncate(contentToText(message.content)),
                    isError: message.isError,
                    status: message.isError ? 'error' : 'done',
                  }
                : m,
            ),
          }))
        }
      }
      break
    }

    case 'tool_execution_start': {
      const t = event as EventToolExecution
      const id = t.toolCallId ?? uid('tool')
      const run: ToolRun = {
        id,
        toolName: t.toolName ?? 'tool',
        status: 'running',
        args: stringifyArgs(t.args),
        result: '',
        startedAt: Date.now(),
      }
      patchFolder(folder, (f) => ({ ...f, tools: [run, ...f.tools].slice(0, 60) }))
      break
    }

    case 'tool_execution_update': {
      const t = event as EventToolExecution
      if (!t.toolCallId) break
      const text = contentToText(t.partialResult?.content)
      patchFolder(folder, (f) => ({
        ...f,
        tools: f.tools.map((r) => (r.id === t.toolCallId ? { ...r, result: truncate(text) } : r)),
      }))
      break
    }

    case 'tool_execution_end': {
      const t = event as EventToolExecution
      if (!t.toolCallId) break
      const text = contentToText(t.result?.content)
      patchFolder(folder, (f) => ({
        ...f,
        tools: f.tools.map((r) =>
          r.id === t.toolCallId ? { ...r, status: t.isError ? 'error' : 'done', result: truncate(text) } : r,
        ),
      }))
      break
    }
  }
}

// Last assistant message id per folder (for text_delta streaming).
const lastAssistantId = new Map<string, string>()

// --- outbound commands ----------------------------------------------------

const sendCommand = (folder: string, command: ClientCommand): void => {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ folder, command }))
  } else {
    pushToast(folder, 'Not connected to the UI router', 'warning')
  }
}

const sendSkillReply = (runId: string, text: string, model?: string): void => {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ folder: '', command: { type: 'skillReply', runId, text, model } }))
  }
}

const retryRun = (runId: string, model?: string): void => {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ folder: '', command: { type: 'skillRetry', runId, text: '', model } }))
  }
}

const requestSkillSnapshot = (runId: string): void => {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ folder: '', command: { type: 'skillSnapshot', runId, text: '' } }))
  }
}

const setRunStatus = (runId: string, status: 'done' | 'error' | 'interrupted'): void => {
  if (ws !== null && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ folder: '', command: { type: 'skillSetStatus', runId, text: '', status } }))
  }
}

// --- hook ---------------------------------------------------------------

export function useUiSocket(): UiSocketState {
  // Idempotent: opens the single shared WebSocket on first call.
  ensureConnected()
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setSelected = useCallback((folder: string | null): void => {
    update((cur) => (cur.selected === folder ? cur : { ...cur, selected: folder }))
  }, [])

  const seedMockRun = useCallback((id: string, run: SkillRunState): void => {
    seedMockRunGlobal(id, run)
  }, [])

  return {
    conn: s.conn,
    folders: s.folders,
    selected: s.selected,
    setSelected,
    state: s.state,
    port: s.port,
    toasts: s.toasts,
    sendCommand: useCallback(sendCommand, []),
    dismissToast: useCallback(dismissToast, []),
    runs: s.runs,
    textGens: s.textGens,
    notifications: s.notifications,
    dismissNotification: useCallback(dismissNotification, []),
    markNotificationsRead: useCallback(markNotificationsRead, []),
    clearNotifications: useCallback(clearNotifications, []),
    sendSkillReply: useCallback(sendSkillReply, []),
    retryRun: useCallback(retryRun, []),
    requestSkillSnapshot: useCallback(requestSkillSnapshot, []),
    setRunStatus: useCallback(setRunStatus, []),
    seedMockRun,
  }
}

const stringifyArgs = (args: unknown): string => {
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args)
  } catch {
    return String(args)
  }
}

function entryToMsg(entry: HelloPayload['entries'][number]): UiMsg {
  const ts = typeof entry.timestamp === 'number' ? entry.timestamp : Date.parse(entry.timestamp)
  if (entry.kind === 'user') return { id: entry.id, kind: 'user', text: entry.text, ts }
  if (entry.kind === 'assistant') return { id: entry.id, kind: 'assistant', text: entry.text, ts, streaming: false }
  if (entry.kind === 'toolResult') {
    return {
      id: entry.toolCallId ?? entry.id,
      kind: 'tool',
      text: truncate(entry.text),
      ts,
      toolName: entry.toolName,
      toolCallId: entry.toolCallId,
      isError: entry.isError,
      status: entry.isError ? 'error' : 'done',
    }
  }
  return { id: entry.id, kind: 'system', text: entry.text, ts }
}
