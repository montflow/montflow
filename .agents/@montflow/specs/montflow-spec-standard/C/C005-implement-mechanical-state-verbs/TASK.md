---
id: C005
name: implement-mechanical-state-verbs
type: execution
originator: planner:B005
size: large
depends-on: B003, C001, C004, C003
related-tasks: C002
status: complete
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
- `init` validates the tier contract before writing: `full` gets an exploration phase A (or `init.exploration-missing`), `micro` rejects exploration and prose-only gates (`init.exploration-forbidden`, `init.gate-kind`), `standard` allows at most one exploratory task in the first phase (`init.exploration-count`, `init.exploration-placement`), `standard` waivers are `records-only` and enforced while `micro` is exempt (`init.waiver-policy`), and a review task is generated only for a non-waived phase (`init.review-task`); `init` and `new-task` also refuse a review task on a waived phase (`task.review-waived`). `init` writes the `## Creation` section (`tier`, self-reported `questions 0/<budget>`, `unresolved`).
- `claim` is the atomic status generator: `--start` (`pending → in-progress`), `--block` (`pending | in-progress → blocked`), `--close` (`in-progress → complete`), and an orchestrator `--release` (`blocked | in-progress → pending`, the only return path from `blocked`) rewrite the task `status:`, the `SPEC.md` row, and the `PHASE.md` mirror in one transaction (temp-then-rename with explicit rollback on any failure); a worker may only bind and release its own session and may not transition status. Only the execution orchestrator (a session holding the orchestrator binding) may call those forms, `gate run`, or `mail`; `stamp`, `waiver`, and `tier` exist with B005's signatures.
- `next` returns the ready set from derived state, honoring dependency ordering and per-phase numbering.
- `migrate` transforms a flat v1 tree into B001's phase tree and then into the v2 `PHASE.md` shape, re-ids tasks where needed, and refuses a version bump that would not transform. After the verbs land, run `mf-specs migrate --all` over the live store and record every per-spec result for C007; `--include-complete` upgrades frozen specs deliberately.
- Nothing in the authoring or execution skills asks an agent to type an id, timestamp, status, or lock afterward.

## Completion

- [x] `init`, `next`, `claim`, `lock`, `state`, `new-phase`, `new-task`, `stamp`, `waiver`, and `tier` are each exercised by an actual run with output recorded in MEMORY.md
- [x] `init` rejects the invalid tier plans (`full` without exploration, `micro` exploration/prose-only gate, `standard` waived with code, waived phase given a review task, `standard` with two exploratory tasks or one outside the first phase), each shown by a run
- [x] `claim --start`/`--block`/`--close` rewrites the task `status:`, the `SPEC.md` row, and the `PHASE.md` mirror atomically, and a forced write failure rolls all three back (shown by a test); the full graph `pending → start → block → release → start` and the `blocked → release → pending` return path are shown by runs; a worker's own bind/release is allowed and changes no status, and the default `micro` tree derives a lock
- [x] `migrate` converts a flat v1 fixture tree to the v2 tree and the result verifies against v2 rules; `migrate --include-complete` upgrades a frozen fixture
- [x] `mf-specs migrate --all` runs over `.agents/@montflow/specs` and the per-spec result is recorded for C007 (frozen complete specs listed separately)
- [x] A second `claim` of a taken task, a worker calling `claim --start`/`claim --block`/`claim --close`/`gate run`/`mail`, and a premature `lock` all fail with actionable messages
- [x] Tests cover id collisions, empty phases, dependency ordering, claim atomicity/rollback, claim authority, `task.review-waived`, the `micro` lock, and refusal paths
