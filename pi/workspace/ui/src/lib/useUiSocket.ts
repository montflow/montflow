import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  /** Send a follow-up answer to a run's agent (folder resolved router-side). */
  sendSkillReply: (runId: string, text: string) => void
  /** Fetch the full transcript for a run (late join / page reload). */
  requestSkillSnapshot: (runId: string) => void
}

/** One agentic skill run as seen by the browser. */
export interface SkillRunState {
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error'
  folder: string
  workspaceId: string
  entries: Array<{ role: 'user' | 'assistant'; text: string }>
  /** Tool activity in order of appearance (`turn` = assistant entry index). */
  tools: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number }>
}

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

let uidCounter = 0
const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(uidCounter++).toString(36)}`

const emptyFolder = (): FolderState => ({
  hello: null,
  messages: [],
  tools: [],
  loop: null,
  loopDone: false,
  busy: false,
})

export function useUiSocket(): UiSocketState {
  const queryClient = useQueryClient()
  const [conn, setConn] = useState<UiSocketState['conn']>('connecting')
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [state, setState] = useState<Record<string, FolderState>>({})
  const [port, setPort] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [runs, setRuns] = useState<Record<string, SkillRunState>>({})

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAssistantId = useRef<Record<string, string | null>>({})
  const prevLoop = useRef<Record<string, FolderState['loop']>>({})

  const pushToast = useCallback((folder: string | null, message: string, level: Toast['level'] = 'info') => {
    const id = uid('toast')
    setToasts((prev) => [...prev.slice(-4), { id, folder, message, level }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const sendSkillReply = useCallback((runId: string, text: string): void => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ folder: '', command: { type: 'skillReply', runId, text } }))
    }
  }, [])

  const requestSkillSnapshot = useCallback((runId: string): void => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ folder: '', command: { type: 'skillSnapshot', runId, text: '' } }))
    }
  }, [])

  // Merge a skillGen chunk into the run state.
  const applySkillGen = useCallback(
    (msg: Extract<ServerMessage, { type: 'skillGen' }>): void => {
      setRuns((prev) => {
        const current = prev[msg.runId]
        // start / snapshot always carry the full transcript; an error for a
        // run we've never seen (e.g. the router replying "no live session")
        // must still materialize the run so the page shows the error instead
        // of "Loading run…" forever.
        if (msg.phase === 'start' || msg.phase === 'snapshot' || (msg.phase === 'error' && current === undefined)) {
          return {
            ...prev,
            [msg.runId]: {
              status: msg.status,
              folder: msg.folder,
              workspaceId: msg.workspaceId,
              entries: [...(msg.entries ?? [])],
              tools: [...(msg.tools ?? [])],
            },
          }
        }
        if (current === undefined) return prev // missed the start — snapshot recovers
        if (msg.phase === 'delta') {
          const entries = current.entries.map((entry, index) =>
            index === msg.entry ? { ...entry, text: entry.text + msg.text } : entry,
          )
          return { ...prev, [msg.runId]: { ...current, entries } }
        }
        if (msg.phase === 'tool') {
          const tools = [...current.tools]
          if (msg.status === 'running') {
            tools.push({ name: msg.text, status: 'running', turn: msg.entry })
          } else {
            const tool = [...tools].reverse().find((t) => t.name === msg.text && t.status === 'running')
            if (tool !== undefined) {
              // Tool phases only ever carry running/done/error — never awaiting.
              tools[tools.indexOf(tool)] = { ...tool, status: msg.status === 'error' ? 'error' : 'done' }
            }
          }
          return { ...prev, [msg.runId]: { ...current, tools } }
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
        }
        return { ...prev, [msg.runId]: { ...current, status: msg.status, entries } }
      })
    },
    [queryClient],
  )

  const sendCommand = useCallback(
    (folder: string, command: ClientCommand) => {
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ folder, command }))
      } else {
        pushToast(folder, 'Not connected to the UI router', 'warning')
      }
    },
    [pushToast],
  )

  const patchFolder = useCallback(
    (folder: string, patch: (f: FolderState) => FolderState) => {
      setState((prev) => ({ ...prev, [folder]: patch(prev[folder] ?? emptyFolder()) }))
    },
    [],
  )

  useEffect(() => {
    let disposed = false
    let attempt = 0

    const connect = (): void => {
      if (disposed) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      setConn('connecting')

      ws.onopen = () => {
        attempt = 0
        setConn('open')
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
            setPort(msg.port)
            setFolders(msg.folders)
            setSelected((sel) => {
              if (sel && msg.folders.some((f) => f.id === sel)) return sel
              return msg.folders[0]?.id ?? null
            })
            const live = new Set(msg.folders.map((f) => f.id))
            setState((prev) => {
              const next = { ...prev }
              for (const key of Object.keys(next)) {
                if (!live.has(key)) delete next[key]
              }
              return next
            })
            break
          }

          case 'hello':
            applyHello(msg.folder, msg.hello)
            break

          case 'event':
            applyEvent(msg.folder, msg.event)
            break

          case 'loopState': {
            const folder = msg.folder
            if (msg.state === null) {
              if (prevLoop.current[folder] !== null && prevLoop.current[folder] !== undefined) {
                patchFolder(folder, (f) => ({ ...f, loopDone: true }))
              }
            } else {
              prevLoop.current[folder] = msg.state
              patchFolder(folder, (f) => ({ ...f, loop: msg.state, loopDone: false }))
            }
            break
          }

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
            // Another tab/session mutated a profile — refresh the profile
            // queries for this workspace.
            void queryClient.invalidateQueries({ queryKey: ['profiles', msg.workspaceId] })
            if (msg.kind === 'created') {
              pushToast(msg.folder, `New profile created: ${msg.profileName}`, 'info')
            } else if (msg.kind === 'deleted') {
              pushToast(msg.folder, `Profile deleted: ${msg.profileName}`, 'info')
            }
            break
          }

          case 'presetChanged': {
            // Another tab/session mutated a review preset — refresh the
            // preset queries for this workspace.
            void queryClient.invalidateQueries({ queryKey: ['presets', msg.workspaceId] })
            if (msg.kind === 'created') {
              pushToast(msg.folder, `New preset created: ${msg.presetName}`, 'info')
            } else if (msg.kind === 'deleted') {
              pushToast(msg.folder, `Preset deleted: ${msg.presetName}`, 'info')
            }
            break
          }

          case 'sessionChanged':
            // The backend replaced its session (agentic skill creation) —
            // keep the folder's session id current so /sessions/<id> routes
            // resolve and the dropdown stays accurate.
            setFolders((prev) =>
              prev.map((f) => (f.id === msg.folder ? { ...f, sessionId: msg.sessionId } : f)),
            )
            break

          case 'modelsChanged':
            // The pickable set or the persisted selection changed (this tab
            // picked a model, another tab did, or a session connected/ran
            // /model) — refresh the model query so every tab converges.
            void queryClient.invalidateQueries({ queryKey: ['models'] })
            break

          case 'skillGen':
            applySkillGen(msg)
            break

          case 'folderGone': {
            setFolders((prev) => prev.filter((f) => f.id !== msg.folder))
            setState((prev) => {
              const next = { ...prev }
              delete next[msg.folder]
              return next
            })
            setSelected((sel) => (sel === msg.folder ? null : sel))
            break
          }
        }
      }

      ws.onclose = () => {
        if (disposed) return
        setConn('closed')
        retryRef.current = setTimeout(() => {
          attempt += 1
          connect()
        }, Math.min(1000 * 2 ** attempt, 10000))
      }

      ws.onerror = () => {
        // onclose follows; retry there.
      }
    }

    const applyHello = (folder: string, hello: HelloPayload): void => {
      prevLoop.current[folder] = hello.loopState
      setState((prev) => ({
        ...prev,
        [folder]: {
          hello,
          messages: hello.entries.map(entryToMsg),
          tools: [],
          loop: hello.loopState,
          loopDone: false,
          busy: false,
        },
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
            lastAssistantId.current[folder] = id
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
            const id = lastAssistantId.current[folder]
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
            const id = message.id ?? lastAssistantId.current[folder]
            if (id) {
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

    connect()

    return () => {
      disposed = true
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [patchFolder, pushToast, queryClient, applySkillGen])

  return {
    conn,
    folders,
    selected,
    setSelected,
    state,
    port,
    toasts,
    sendCommand,
    dismissToast,
    runs,
    sendSkillReply,
    requestSkillSnapshot,
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
