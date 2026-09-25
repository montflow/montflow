---
id: B006
name: implement-subruns
type: execution
originator: user
depends-on: B002
related-tasks: B002
status: complete
---

# Task B006: Parent/related runs + completion notification

## Type: execution

## Description

Runs are subagent-like: a run may name a `parent` run and any number of
`related` runs. When a child settles, the engine notifies a live parent by
queueing a completion message into the parent's session, and still fires the
per-run host `onSettled` hook. This lets a coordinator schedule many subruns
and react as each finishes.

## Requirements

- `Run` gains `related` (non-parent links); `parent` already existed.
- `Runner.start` accepts `parent` and `related`, persisted at create.
- `SessionPort` gains `followUp`; the Pi factory wires `session.followUp`.
- On settle, a live parent receives `Subrun '<id>' settled: <outcome>. <summary>`.
- `start` returns the running run (not the pending descriptor).
- Tests for parent notification, related persistence, and running return.

## Completion

- [x] Implementation matches the locked contract
- [x] Tests pass (`bun run --cwd packages/pi-runs test`)
- [x] Output summarized in MEMORY.md
