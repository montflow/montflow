---
id: B001
name: implement-run-store
type: execution
originator: user
depends-on: A099
related-tasks:
status: complete
---

# Task B001: Implement own-store persistence + resume

## Type: execution

## Description

Make our Store the sole owner of run history and add resume, per A002. Extend
`RunEvent.Event` if needed for lossless replay, add a replay routine that seeds
`SessionManager.inMemory` from `session.jsonl`, and add a durable transcript
writer fed by Pi `message_end`. No Pi session files anywhere.

## Requirements

- `session.jsonl` is sufficient to resume on another machine.
- Replay produces the same conversation context as before commit/push.
- Store remains the only writer of `runs/<id>/`.
- Unit tests for write/read/replay round-trip, including partial transcripts.
- `CONTEXT.md` updated.

## Completion

- [ ] Implementation matches the A004 contract
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
