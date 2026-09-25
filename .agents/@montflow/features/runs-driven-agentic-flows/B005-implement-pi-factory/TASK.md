---
id: B005
name: implement-pi-factory
type: execution
originator: user
depends-on: B002
related-tasks:
status: complete
---

# Task B005: Implement the real Pi session factory

## Type: execution

## Description

Add the concrete `SessionFactory` layer over `@earendil-works/pi-coding-agent`:
build an `AgentSession` with `SessionManager.inMemory(cwd)`, seed
`Replay.toMessages`, resolve the model pin, and bind extensions with an
`ExtensionUIContext` whose `input` / `notify` route to `SessionUi`. Map
`message_end` → `SessionEvent.message`, `agent_settled` → `settled`.

## Requirements

- `SessionFactory` layer exported and provided by `Runner.Default` consumers.
- UI context implements the full `ExtensionUIContext` (no-ops for unsupported TUI methods).
- Session disposal/abort wired to `SessionPort`.
- `ts:check` and package tests pass; factory logic unit-tested where possible.

## Completion

- [ ] Engine runs a real Pi session end to end
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
