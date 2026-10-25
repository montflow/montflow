---
id: C006
name: retire-pi-sessions
type: execution
originator: user
depends-on: C003, C004, C005
related-tasks:
status: complete
---

# Task C006: retire-pi-sessions

## Type: execution

## Description

Delete the montflow session engine as one atomic commit once every consumer
runs on native sessions and the `subagent` tool (B003 §9, B001 §6, A006 §5.6).

## Requirements

- Confirm every `activeSessionRunnerHost` consumer (C003, C004, C005) is green on native sessions/subagent before the cut.
- Delete `packages/pi-sessions`, `mf-sessions`, `verify:montflow:sessions`, and the remaining host wiring in one commit.
- Grep the repo for dangling `pi-sessions`, `activeSessionRunnerHost`, and `mf-sessions` references; none may remain.
- `verify:montflow` green without the `:sessions` extension task.

## Completion

- [x] C003–C005 complete and green on native sessions; no `activeSessionRunnerHost` consumer outside `pi-sessions`.
- [x] `packages/pi-sessions`, `mf-sessions`, `verify:montflow:sessions`, `.pi` wiring, CI cell, and the dispatch skill removed in one atomic cut (`3d7e0ff`).
- [x] Repo sweep removed the workspace Pi-era session layer and repointed prompts/profiles at the native `subagent` tool.
- [x] Grep gate clean outside historical spec/review records.
- [x] `verify:montflow` green without the sessions task (16/16 turbo tasks, all extension verifies 0 issues).
