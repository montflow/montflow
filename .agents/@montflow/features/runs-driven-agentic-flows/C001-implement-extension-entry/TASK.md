---
id: C001
name: implement-extension-entry
type: execution
originator: user
depends-on: B099
related-tasks:
status: complete
---

# Task C001: Register the runs Pi extension

## Type: execution

## Description

Add `packages/pi-runs/src/extension.ts` over the B002 engine: register commands
and agent-callable tools (dispatch, steer, answer, status), the completion
hook, and the two workspace notification calls. Add the `pi.extensions`
manifest metadata and `.pi/settings.json` registration path, mirroring
`@montflow/pi-profiles`.

## Requirements

- Extension default export wires the engine; load failures surface.
- Commands/tools per the A004 surface list.
- `pi list` probe returns true once registered.
- `ts:check` and package tests pass.

## Completion

- [ ] Extension loads under package registration
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
