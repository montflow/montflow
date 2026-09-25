---
id: B002
name: implement-run-engine
type: execution
originator: user
depends-on: B001
related-tasks:
status: complete
---

# Task B002: Implement the run engine

## Type: execution

## Description

Build the run engine over the backend chosen in A004: create → start → stream →
steer/ask/answer → settle, driving a Pi session and keeping the Store truthful.
This is the shared core both surfaces and the workspace call. Include the
workspace notification bridge and the completion hook per A004.

## Requirements

- Lifecycle methods: `start`, `steer`, `ask`, `answer`, `interrupt`, `settle`, `load`, `list`.
- Session transcript mirrored into the Store; receipt written exactly once.
- Model pin and cwd flow through.
- Engine is surface-agnostic (no TUI/CLI imports).
- `CONTEXT.md` documents the engine boundary.

## Completion

- [ ] Implementation matches the A004 contract
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
