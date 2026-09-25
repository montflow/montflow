# Memory

## Context

Task A001: choose how `@montflow/pi-runs` executes a run against Pi.

## Progress

- 2026-09-21: complete.

## Findings

Read local docs/typings at `node_modules/@earendil-works/pi-coding-agent/dist/`
(`core/agent-session.d.ts`, `core/sdk.d.ts`, `core/session-manager.d.ts`,
`modes/rpc/*`, `docs/rpc.md`).

`AgentSession` is the shared core for **all** Pi run modes (interactive, print,
rpc). It already exposes everything a run needs:

- lifecycle: `prompt(text, { streamingBehavior })`, `steer(text)`,
  `followUp(text)`, `abort()`, `clearQueue()`, `dispose()`
- state: `isStreaming`, `messages`, `sessionFile`, `sessionManager`
- streaming: `subscribe(listener)` emitting `message_end`, `turn_end`,
  `queue_update`, `agent_end`, `agent_settled`, `tool_execution_*`
- host UI: `bindExtensions({ uiContext, mode, commandContextActions,
  abortHandler, onError })` — `uiContext.input/select/confirm/notify` is the
  Q&A + notification channel

`SessionManager` still needed as the runtime carrier, but we do **not** use its
file persistence: `inMemory(cwd)` only. Our Store owns the durable transcript
and resume replays it back into a fresh in-memory manager.

## Recommendation

Engine runs **in-process** `AgentSession` — not `pi --mode rpc` subprocess.

- Workspace consumes the package as a dependency; no IPC/process bridge.
- Steering + Q&A are native method calls, not a protocol to serialize.
- The agent's `ask` becomes a custom tool whose handler calls the bound
  `uiContext.input`, which the engine routes as park/answer.
- Pi runs on `SessionManager.inMemory`; our Store is the source of truth and
  resume replays `session.jsonl` into a fresh in-memory manager.
- Same engine backs the CLI; `pi --mode rpc` stays available for out-of-process
  hosts later without changing the engine boundary.

## Open Questions

- None blocking; feeds A004 decision 1.

## Handoff

- A004: lock in-process `AgentSession` as the backend.
- B002: engine wraps `AgentSession` + `bindExtensions` + `subscribe`.

## Deviations

- None.
