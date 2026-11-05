# Memory

## Context

- F001 (`planning`, `write-scope: none`): decide the dependency-integrity contract; F002 implements it.
- Read: phase brief, TASK.md, structure/task modules + colocated tests, SPEC.md dependency clauses 158–162.
- No `F/BOARD.md`, no `F001/MAILBOX.md`, no `F001/GATES.md` exist.

## Progress

- Bound F001 with `mf-specs claim`; wrote this record; ran the read-only store scan (`/tmp/F001.log`). No source or spec record edited.

## Findings

Decision: all new rules are errors; codes are field-namespaced and every existing dependency finding also gains a code.

| Rule | Code | Owner | Site | Field |
| --- | --- | --- | --- | --- |
| Non-review task reaches its phase review | `depends-on.own-phase-review` | structure | `verifySpecTree` | `task <id>` |
| Complete dependent, non-complete target | `depends-on.complete-before-target` | structure | `verifySpecTree` | `task <id>` |
| Duplicate `depends-on` id | `depends-on.duplicate` | task | `verifyTaskFile` | `depends-on` |
| `related-tasks` target missing | `related-tasks.unknown-target` | structure | `verifySpecTree` | `task <id>` |
| `related-tasks` self-reference | `related-tasks.self-reference` | structure | `verifySpecTree` | `task <id>` |
| Existing: unknown / self / forward / cycle | `depends-on.unknown-target` / `.self-reference` / `.forward-phase` / `.cycle` | structure | `verifySpecTree` | `task <id>` / `depends-on` |

**Own-phase review.** Walk `depends-on` transitively through same-phase ids only; one finding per non-review source at the first (BFS, shortest) path. Earlier-phase reviews stay valid; review sources are exempt; a completed deadlock still fails; no review task means no finding. Direct: message `Task '<id>' depends on its own phase's review task '<review>'; the review waits on every non-review task, so phase '<phase>' can never be ready.`, actual `<id> -> <review>`, fix `Remove the 'depends-on' edge to '<review>'; a review task may depend on its phase's work, never the reverse.` Chain: same message with `through <id> -> <next> -> <review>`, actual the full chain, fix names `<next>`.

**Complete-before-target.** Error: the ready set never dispatches ahead of a dependency, so a complete dependent with a non-complete target (pending/in-progress/blocked) is a false history, like `task.completion-unchecked`; a warning would let `check` pass. Message `Task '<id>' is complete but its depends-on target '<dep>' is '<status>'; a task cannot complete ahead of a dependency.`, actual `<dep> is <status>`, fix `Complete '<dep>' and prove its gate, or set '<id>' back to 'in-progress' until '<dep>' completes.` Check direct edges only; skip unknown targets (already `depends-on.unknown-target`, never twice).

**Duplicate.** Error, matching duplicate `reviewer-profiles`: same module (`task`), same loop, same message shape `'<id>' is listed more than once.`, field `depends-on`, expected `each task id at most once`, actual `<id> listed <n> times`, fix `Remove the repeated '<id>' from 'depends-on:'.` A repeated invalid id reports only `is not a task id` (else-if order). No silent normalization: disk and memory would diverge.

**Related-tasks.** Unknown: `related-tasks '<rel>' has no task directory.`, expected `a task id in this spec`, actual `<rel> not found`, fix `Remove '<rel>' from 'related-tasks:', or create that task; a relation is a cross-reference, never a scheduling edge.` Self: `related-tasks must not reference the task itself.`, actual `<id>`, fix `Remove '<id>' from 'related-tasks:'.` Both error, in `structure`; cross-spec ids are unknown. `related-tasks` never feeds `findCycle`, `reaches`, the ready set, or write-scope overlap.

**Tests.** structure `verify-spec-tree.test.ts`: direct own-phase review; chained `A001 -> A002 -> A099`; earlier-phase review accepted; complete-on-pending; complete-on-complete accepted; unknown dependency on a complete task reported once; related missing; related self; related-to-other accepted. task `verify-task-file.test.ts`: duplicate `depends-on`; repeated invalid id once. Extend the local `task()` fixture with `relatedTasks?`; switch the two existing forward/cycle `toContainEqual` literals to `objectContaining` once codes land.

Scan: 14 specs, 264 tasks, zero violations — `duplicate-depends-on 0`, `complete-dep-incomplete 0`, `related-self 0`, `related-missing 0`, `own-phase-review 0`; no spec gains a finding when the rules land.

## Gates

- Planning task: no gate run; no tests/typecheck/lint/build/repo-wide check. Evidence is the scan in `/tmp/F001.log`.

## Open Questions

- None blocking; only the F002 assertion update above.

## Handoff

- F002 implements in this order: task duplicate; structure codes/fixes; complete-before-target; own-phase review; related-tasks; then the fixtures. The own-phase "path" is the chain in `actual`; location stays `task <id>`.

## Deviations

- `claim` wrote the workspace claim registry, binding F001 to this session. No status, lock, TASK.md, SPEC.md, or PHASE.md changed.
