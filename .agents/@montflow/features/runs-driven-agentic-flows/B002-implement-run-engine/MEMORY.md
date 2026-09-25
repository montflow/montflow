# Memory

## Context

Task B002: run engine core.

## Progress

- 2026-09-21: complete (core). Real Pi session factory split to B005.

## Done

- `services/runner`: `SessionPort` / `SessionFactory` abstraction, `WorkspaceBridge`
  (toast + notify, no-op default), `Runner` service.
- `Runner.start` creates + starts the store run, appends the user turn (raw
  message), builds/subscribes the session, forks the prompt.
- `Runner.resume` replays `Replay.toMessages` into the session; refuses settled
  or non-replayable runs.
- `Runner.steer` / `answer` / `interrupt` / `detail` / `list`.
- `message_end` mirrors assistant/toolResult into `Store`; `agent_settled`
  writes one receipt and fires `onSettled`.
- Ask flow: `ui.input` parks via `Store.ask`, awaits a `Deferred`; `answer`
  completes it.
- Tests: fake session factory covers start/mirror/settle, steer, park/answer.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (44 tests).
- Workspace `ts:check` + runs service tests still pass (additive schema change).

## Remaining

- B005: real `SessionFactory` over `createAgentSession` + `ExtensionUIContext`
  (input/notify wired to `SessionUi`).

## Open Questions

- None.

## Handoff

- B003 verify reads `Runner`; B005 supplies the Pi factory; C/D surfaces call `Runner`.

## Deviations

- Real Pi factory deferred to B005 to keep B002 testable without Pi.
