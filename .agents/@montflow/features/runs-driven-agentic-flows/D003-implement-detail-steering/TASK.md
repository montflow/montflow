---
id: D003
name: implement-detail-steering
type: execution
originator: user
depends-on: D002
related-tasks:
status: complete
---

# Task D003: Run detail steering + answering UI

## Type: execution

## Description

Upgrade `apps/workspace/src/components/run-detail.tsx` and the `app.tsx` run
keybinds: send steering messages while running, answer questions while parked,
show live state, and refresh the transcript. Add keybind copy to `keybinds.ts`.

## Requirements

- `a` answer (parked), `s` steer (running) with text input; esc cancels input.
- Transcript reflects streamed events without losing the detail view.
- Existing `v` / `x` / `R` / esc behavior preserved.
- Tests for keybind dispatch and detail rendering.

## Completion

- [ ] Steering and answering work against the D002 runner
- [ ] Tests pass (`bun run --cwd apps/workspace test`)
- [ ] Output summarized in MEMORY.md
