---
name: montflow-spec-completion-gate
status: complete
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-28
locked-phases: A
---

# montflow spec completion gate

## Description

A spec can be authoring-complete but still carry pending tasks, and nothing
stops a change from merging while the spec it implements is half done. The
verifier only fails a spec that contradicts itself; a pending spec is a
legitimate state, so `mf:specs check` passes it and so does CI.

Add a completion gate for the specs a change *names*. A commit carries one
`Spec: <kebab-name>` trailer per spec it closes; CI reads those trailers and
runs `mf-specs check --name <spec> --require-complete`, which fails unless the
spec's `SPEC.md` status is `complete`. The rule applies to every spec in the
store without forcing unrelated in-progress specs to block a change: only the
named specs are gated.

## Requirements

- `check` accepts `--require-complete`: for each checked spec it appends a
  single error when `SPEC.md` does not read `status: complete`, naming the spec
  and the trailer to drop. The existing tree and lifecycle checks are unchanged.
- `--require-complete` works with `--name` (the CI form) and without it (every
  spec must be complete), and through the slash form.
- The completion finding is an error, so `mf-specs check --require-complete`
  exits non-zero and the report prints it like any other finding.
- A change names the specs it closes with `Spec: <kebab-name>` trailers, one per
  spec, in any commit of the change. No trailer means no gate for that change.
- CI runs the gate for every trailer: a missing spec, a spec that does not
  verify, or a spec that is not complete fails the job.
- The convention is documented where contributors look: the root `AGENTS.md`
  gate section and the package README CLI list.
- A spec with pending tasks cannot be merged while a change declares it; finish
  the spec or drop the trailer.

## Tasks

| ID   | Name                        | Type      | Status  | Gates |
| ---- | --------------------------- | --------- | ------- | ----- |
| A001 | implement-require-complete  | execution | complete | Yes   |
| A002 | wire-ci-and-convention      | execution | complete | Yes   |
| A099 | review-phase                | review    | complete | No    |
