---
id: C004
name: port-dispatch-extensions
type: execution
originator: user
depends-on: C001, C002
related-tasks:
status: complete
---

# Task C004: port-dispatch-extensions

## Type: execution

## Description

Port the in-session dispatch concerns (`reviews`, `skills`) onto
`SessionDispatchPort`, `ToolPort`, and `SkillPort`, removing every
`Runtime.activeSessionRunnerHost` consumer (B001 §1, B003 §6, A006 §5.4).

## Requirements

- Add plugin faces to `@montflow/{reviews,skills}`.
- Route dispatch/resume through `SessionDispatchPort`; register `review_create` via `ToolPort`, skills via `SkillPort`, slash via `CommandPort`; use `EventPort` where needed.
- Remove every `Runtime.activeSessionRunnerHost` consumer; delete `pi-reviews`/`pi-skills`.
- Loader smoke plus port contract tests; manual review and skill dispatch through a native session.
- `verify:montflow` green.

## Completion

- [x] `@montflow/reviews` and `@montflow/skills` ship `./server` + `./tui` plugin faces.
- [x] `SkillPort` + `EventPort` added to the adapter and wired through `makePorts`.
- [x] Review dispatch/resume and skill dispatch run on native `SessionDispatchPort`; `review_create` and the `skill_*` tools register via `ToolPort`; slash stays on `CommandPort`.
- [x] Zero `Runtime.activeSessionRunnerHost` consumers remain outside `pi-sessions` (retired in C006).
- [x] Loader smoke covers both packages; port contract and dispatch tests pass.
- [x] `verify:montflow` green (17/17 turbo tasks, all extension verifies 0 issues).
