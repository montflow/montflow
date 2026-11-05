---
id: F001
name: decide-dependency-contract
type: planning
originator: user
size: tiny
depends-on:
related-tasks: C001
status: complete
write-scope: none
---

# Task F001: decide the dependency-integrity contract

## Type: planning

## Description

`check` validates the explicit `depends-on` graph — target existence,
self-reference, forward-phase edges, and cycles — but not the contradictions
around it. A non-review task may depend on its own phase's review task: the
explicit graph is acyclic, so `check` passes, yet the ready set can never
dispatch because the review waits for every non-review task and one of them
waits for the review. A `complete` task may depend on a pending task, a
`depends-on` list may repeat an id, and a `related-tasks` entry may name a task
that does not exist. Decide the rule for each, its severity and code, and the
module that owns it, so the implementation is mechanical.

## Requirements

- Decide the own-phase review rule: a non-review task must not depend on its
  phase's review task, directly or through a chain of same-phase dependencies.
  Name the finding, its code, its message, and the path it reports.
- Decide whether a `complete` task whose `depends-on` target is not `complete`
  is an error or a warning, and what fix the diagnostic names. Justify it
  against the ready-set rule that never dispatches ahead of a dependency.
- Decide the duplicate `depends-on` rule: error, or silently normalized. The
  duplicate `reviewer-profiles` entry is already an error; match it or explain
  the difference.
- Decide the `related-tasks` rule: must the target exist, and is a
  self-reference an error? Keep it separate from `depends-on`, which carries
  ordering.
- Name the module that owns each rule (`structure` for the cross-file graph,
  `task` for per-file list shape) and the tests that pin it. A rule only a
  reviewer can check is out of scope.
- Record the scan of the current store: none of the stores' specs may already
  violate a rule that is about to become an error.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Each contradiction has a rule, a severity, a stable code, and a fix string
- [x] Each rule names its owning module and its test
- [x] The decision records that no existing spec in the store violates the new rules
