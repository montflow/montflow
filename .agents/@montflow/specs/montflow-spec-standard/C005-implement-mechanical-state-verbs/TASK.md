---
id: C005
name: implement-mechanical-state-verbs
type: execution
originator: planner:B003
size: large
depends-on: C001, C004, C003
related-tasks: C002
status: pending
---

# Task C005: implement mechanical state verbs

## Type: execution

## Description

Ship the generators that retire hand-written mechanics: ids, timestamps, scaffolds,
claims, locks, derived state, the ready set, and the v1-to-v2 migration.

## Requirements

- `new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, `state`, `next` exist with the signatures B003 decided, taking ids from disk rather than from caller arithmetic.
- `init` writes a whole spec tree from a tier file, leaving only prose for the agent to fill, and an unknown tier fails listing the enum.
- `next` returns the ready set from derived state, honoring dependency ordering and per-phase numbering.
- `claim` is the only atomic status write and records the session binding; `lock` refuses when the phase is not derivably complete.
- `migrate` transforms a v1 tree into v2, re-ids tasks, creates phase directories, converts locks to derived state, and refuses a bump that would not transform.
- Nothing in the authoring or execution skills asks an agent to type an id, timestamp, status, or lock afterward.

## Completion

- [ ] `init`, `next`, `claim`, `lock`, `state` each exercised by an actual run with output recorded in MEMORY.md
- [ ] `migrate` converts a v1 fixture tree to v2 and the result verifies against v2 rules
- [ ] A second `claim` of a taken task and a premature `lock` both fail with actionable messages
- [ ] Tests cover id collisions, empty phases, dependency ordering, and refusal paths
