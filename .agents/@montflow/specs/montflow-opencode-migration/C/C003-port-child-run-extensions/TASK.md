---
id: C003
name: port-child-run-extensions
type: execution
originator: user
depends-on: C001, C002
related-tasks:
status: complete
---

# Task C003: port-child-run-extensions

## Type: execution

## Description

Port the child-run concerns (`prompts`, `profiles`) onto the adapter's `ModelPort`
and `SessionDispatchPort` (create/prompt + native `subagent`), replacing the Pi
`ModelRuntime` child runs (B001 §1, B003 §2/§6).

## Requirements

- Add `./server` + `./tui` plugin faces to `@montflow/{prompts,profiles}`.
- Route child runs through `ModelPort` + `SessionDispatchPort` (create/prompt + native `subagent`).
- Register the `execute` tool via `ToolPort` and profiles via `AgentPort`; expose slash via `CommandPort`.
- Delete `pi-prompts`/`pi-profiles` once the native path is green; extend the loader smoke to both packages.
- Port contract tests pass; `verify:montflow` green.

## Completion

- [x] `./server` + `./tui` plugin faces added to `@montflow/{prompts,profiles}`.
- [x] Child runs routed through `ModelPort` + `SessionDispatchPort` (create/prompt + native `subagent`).
- [x] `execute` tool via `ToolPort`, profiles via `AgentPort`, slash via `CommandPort`.
- [x] `pi-prompts`/`pi-profiles` deleted; loader smoke extended to both packages (7 pass).
- [x] Port contract tests pass; `verify:montflow` green (17/17 turbo tasks, extensions 0 issues).
