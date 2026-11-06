# Memory

## Context

- F002 (`execution`, `write-scope: packages/specs`): implement F001's dependency-integrity decision.
- Read: phase brief, TASK.md/GATES.md, F001 MEMORY.md, structure/task modules + CONTEXT, both colocated tests.
- No `F/BOARD.md` and no `F002/MAILBOX.md` existed at start or before receipt.

## Progress

- Bound F002 with `mf-specs claim` (`ses_e58780410ffeWRhRwc0zup63SU`); no status changed.
- Implemented task-module duplicate `depends-on` rule; dependency pass lives in `structure/dependency.module.ts` with `tests/dependency.test.ts`.
- Added nine structure fixtures and two task fixtures; updated both module `CONTEXT.md` files.
- Full scoped logs: `/tmp/F002.log`.

## Findings

- New codes: `depends-on.own-phase-review`, `depends-on.complete-before-target`, `depends-on.duplicate`, `related-tasks.unknown-target`, `related-tasks.self-reference`.
- Existing dependency findings now coded: `depends-on.unknown-target`, `.self-reference`, `.forward-phase`, `.cycle`; every one carries expected/actual/fix.
- Own-phase review uses BFS over same-phase ids only, reports the shortest chain once per non-review source, and exempts review tasks and earlier-phase reviews.
- Complete-before-target checks direct edges only and skips unknown targets, so an unknown target keeps its single existing finding.
- Duplicate `depends-on` reports once per distinct id, normalizes nothing, and a repeated malformed id keeps only its one `is not a task id` finding.
- `related-tasks` resolution is independent of scheduling: it never feeds the ready set, cycle detection, or write-scope overlap.
- F001's store scan found zero baseline violations, so no spec record gains a finding when these rules land.

## Gates

- Pass (scoped): CLI structure test (6 tests); structure test file 100 tests / 2 files; task test file 42 tests / 2 files; dependency test file; `ts:check`; `lint:check`; `format:check`.
- Not run (orchestrator-owned): official GATES.md gate, repo-wide `mf-specs:check`, full suite.

## Open Questions

- None.

## Handoff

- Orchestrator runs GATES.md once, including `format:check`, the spec-store scan, and the repo-wide gate. No follow-up work is known.

## Deviations

- `claim` wrote the workspace claim registry (session binding only); no TASK.md, SPEC.md, PHASE.md, status, or lock changed.
