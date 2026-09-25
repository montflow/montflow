# Memory

## Context

Task A002: own-store persistence + cross-machine resume.

## Progress

- 2026-09-21: complete.

## Findings

Pi `Message = UserMessage | AssistantMessage | ToolResultMessage`
(`pi-ai/dist/types.d.ts`). Assistant messages carry `api/provider/model/usage/
stopReason/content[]` (text, thinking, tool calls); tool results carry
`toolCallId/toolName/content/isError`. Our current `Event` (`seq/role/text/at`)
cannot reconstruct those — text-only replay would lose tool calls and usage.

`SessionManager.inMemory(cwd)` exposes `appendMessage(message)` and
`buildSessionContext()`, so a fresh in-memory manager can be seeded from our
stored events before creating the `AgentSession`.

## Design

**Source of truth = our Store.** Pi never writes a session file; the engine runs
on `SessionManager.inMemory(cwd)` and mirrors into `runs/<id>/`.

**Lossless replay — extend `RunEvent.Event`:**

- add `toolResult` to `Role`;
- add optional `message: Schema.Unknown` carrying the raw Pi `Message` JSON;
- keep `text` as the human display projection (drives `run.md`).

Legacy events without `message` replay as minimal `{ role, content: text,
timestamp }`. New events always carry `message`.

**Write path:** subscribe to `AgentSession` `message_end`; for each message
append an `Event` (role from `message.role`, `text` projected from content,
`message` raw). `run.md` re-renders from events; receipt written once on
`agent_settled`.

**Resume algorithm:**

1. `Store.load(id)` → run + events (+ receipt).
2. Terminal runs (receipt present) do not resume; only `running`/`awaiting-input`.
3. `manager = SessionManager.inMemory(cwd)`.
4. For each event in `seq` order: `manager.appendMessage(event.message ??
   synthesize(event))`.
5. Build `AgentSession` over `manager`; bind `uiContext`; mirror new messages.
6. Continue: parked → deliver the answer; otherwise prompt the next input.
7. Settle once on `agent_settled`.

**Git portability:** commit `run.md`, `session.jsonl`, `receipt.md`; keep
transient `.lock` out of git. Append-only JSONL can conflict — rule: pull before
resume, never run the same run on two machines at once. `run.md` is derived and
regenerable.

**Subagent framing:** `parent` frontmatter already exists; subrun depth cap 2
(see `packages/pi-runs/wiki/session-model.md`); settle children before parent.

## Open Questions

- A004: confirm the `Event.message` schema extension is acceptable (schema change).

## Handoff

- A004: lock own-store + replay + `Event.message`.
- B001: implement write path + replay; B002 wires it to `AgentSession`.

## Deviations

- None.
