---
id: B003
name: decide-session-engine-mapping
type: planning
originator: user
depends-on: A003, A006
related-tasks:
status: pending
---

# Task B003: Decide to retire pi-sessions onto native sessions and subagents

## Type: planning

## Description

Record the decision to delete the montflow session engine and use OpenCode's
built-in session execution and subagent system as the single mechanism, and
specify the exact native calls that replace every `pi-sessions` flow.

## Requirements

- Record the decision to delete `pi-sessions` and adopt OpenCode's built-in session/subagent system as the only session mechanism; no montflow engine is retained.
- Specify the exact `ctx.session.*` calls and subagent invocations that replace each flow: dispatch, steer, interrupt, resume, answer, and author/modify sessions.
- Decide what replaces the receipt/replay/verify ledger and the custom lifecycle states; the default is to drop them, and any retained piece is the smallest possible projection.
- Decide the fate of the `session_*` agent tools and the `mf-sessions` CLI: retired, or remapped onto native session/subagent operations.
- Specify how each `activeSessionRunnerHost` consumer (`pi-reviews` dispatch, the workspace) moves onto native sessions and subagents.
- Specify the migration and rollback, including how the engine is kept recoverable until the native replacement ships.

## Completion

- [ ] Retire-`pi-sessions` decision recorded with the native call mapping
- [ ] Ledger/lifecycle fate and tool/CLI fate decided
- [ ] Consumer migration and rollback specified
