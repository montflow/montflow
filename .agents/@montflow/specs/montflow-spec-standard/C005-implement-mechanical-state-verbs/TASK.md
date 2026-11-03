---
id: C005
name: implement-mechanical-state-verbs
type: execution
originator: planner:B005
size: large
depends-on: B003, C001, C004, C003
related-tasks: C002
status: pending
---

# Task C005: implement mechanical state verbs

## Type: execution

## Description

Ship the generators that retire the remaining hand-written mechanics: ids,
timestamps, phase and task creation, claims, locks, the tier-driven init, and the
v1-to-v2 migration. Main already ships `state` and `next`; keep and extend them
rather than writing a second pair.

## Requirements

- `new-phase`, `new-task`, `stamp`, `init`, `claim`, and `lock` exist with the signatures B005 decided, taking ids from disk rather than from caller arithmetic. The shipped `state` and `next` are extended, not re-specified.
- `init` writes a whole spec tree from a tier file, leaving only prose for the agent to fill, and an unknown tier fails listing the enum.
- `next` returns the ready set from derived state, honoring dependency ordering and per-phase numbering.
- `claim` is the only atomic status write and records the session binding; `lock` refuses when the phase is not derivably complete.
- `migrate` transforms a flat v1 tree into B001's phase tree and then into the v2 `PHASE.md` shape, re-ids tasks where needed, and refuses a version bump that would not transform.
- Nothing in the authoring or execution skills asks an agent to type an id, timestamp, status, or lock afterward.

## Completion

- [ ] `init`, `next`, `claim`, `lock`, and `state` each exercised by an actual run with output recorded in MEMORY.md
- [ ] `migrate` converts a flat v1 fixture tree to the v2 tree and the result verifies against v2 rules
- [ ] A second `claim` of a taken task and a premature `lock` both fail with actionable messages
- [ ] Tests cover id collisions, empty phases, dependency ordering, and refusal paths
