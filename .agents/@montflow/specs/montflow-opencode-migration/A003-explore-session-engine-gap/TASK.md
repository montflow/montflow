---
id: A003
name: explore-session-engine-gap
type: exploratory
originator: user
depends-on:
related-tasks:
status: pending
---

# Task A003: Compare the pi-sessions engine with OpenCode sessions

## Type: exploratory

## Description

Validate the working hypothesis that `pi-sessions` is retired entirely: the
migration uses OpenCode's built-in session execution and subagent system rather
than a montflow-owned session engine. Compare each `pi-sessions` capability with
OpenCode's session model, confirm the built-in system covers it (or name the
blocker), and identify the minimum that must survive outside OpenCode. The
session engine is the deepest dependency in the toolchain, so this task decides
the highest-risk part of the migration.

## Requirements

- State the working hypothesis as the default: `pi-sessions` is gone, replaced by `ctx.session.*` and OpenCode's built-in subagent system; a montflow session engine is retained only if a concrete capability cannot be met.
- Inventory `pi-sessions`: durable transcript store, lifecycle states, steer/answer/interrupt/resume, receipts, replay/verify, `SessionRunner`/`SessionFactory`/`SessionPort`, `Runtime.activeSessionRunnerHost`, child-session tools (`ask_user`, `notify_user`, `toast_user`, `update_status`), and the `session_*` agent tools.
- Inventory OpenCode's session and subagent surface: `ctx.session.create/get/remove/prompt/generate/command/synthetic/interrupt/wait/update/move/context/switchAgent/switchModel/compact`, delivery (`steer`/`queue`), durable inbox, the subagent tool and parent/child sessions, background jobs, and the session event stream.
- For each `pi-sessions` capability, record whether OpenCode's built-in session/subagent system covers it; treat "no equivalent" as a blocker to escalate, not as a reason to keep the engine.
- Decide the fate of the receipt/replay/verify ledger with the default to drop it; if any part must survive, specify the smallest projection and its cost.
- Identify every consumer of `activeSessionRunnerHost` today (`pi-reviews` dispatch, the workspace) and how each moves onto `ctx.session.*` and subagent sessions.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Capability-by-capability comparison captured in MEMORY.md
- [ ] Retire-or-keep feasibility verdict recorded, with any blocker named
- [ ] Ledger fate and `activeSessionRunnerHost` consumers recorded
