# Memory

## Context

Task B001: own-store persistence + replay.

## Progress

- 2026-09-21: complete.

## Done

- `RunEvent.Event`: role gained `toolResult`; `text` may be empty; optional raw
  `message` (Pi `Message` JSON); new `EventInput` contract for conditional keys.
- `Store.append` / `Store.answer` accept optional `message` and persist it.
- New `modules/replay`: `replayable`, `canReplay`, `toMessage`, `toMessages` —
  raw message wins, user turns synthesize from text, system pointers skip,
  assistant/toolResult without raw message are not replayable.
- `@earendil-works/pi-ai` added to pi-runs dev + peer deps (type-only import).
- Tests: replay suite, raw-message append, toolResult/empty-text decode.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass.

## Open Questions

- None.

## Handoff

- B002 seeds `SessionManager.inMemory` from `Replay.toMessages(events)` and
  writes raw messages on `message_end`.

## Deviations

- None.
