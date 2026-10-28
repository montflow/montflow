---
id: A002
name: inventory-prototype-deltas
type: exploratory
originator: user
depends-on: A001
related-tasks:
status: complete
---

# Task A002: inventory-prototype-deltas

## Type: exploratory

## Description

The phase-directories prototype is preserved unmerged as commit `f17365f` on
`feat/phase-folders`, built 35 commits ago on the retired `packages/pi-specs`
tree. Extract what it proves about the layout and the verifier, and separate
that from the parts the current tree already supersedes, without checking out or
merging anything.

## Requirements

- Read the prototype read-only: `git show f17365f --stat`, plus
  `git show f17365f:packages/pi-specs/src/modules/structure/structure.module.ts`,
  `.../modules/task/task.module.ts`, `.../services/spec-store/spec-store.services.module.ts`,
  `.../skills/authoring-spec.ts`, the structure tests, and the old skill copy.
- Do not check out, reset, rebase, merge, delete, or otherwise modify
  `feat/phase-folders` or commit `f17365f`. Record the commit hash in MEMORY.md.
- Produce a delta table with one row per prototype hunk, each marked **port**,
  **adapt**, or **do not port**, with a one-line reason.
- **Do not port**: the `review:` and `review-cycles:` task fields,
  `REVIEW_CYCLES_PATTERN`, `reviewReferences`, the `ReviewProbe` service and its
  tests, and the `review`-series wiring. The current tree already has
  `reviewer-profiles` and `modules/review-link` (merged PR #2); record the
  concrete replacement for each so no gap is silently dropped.
- **Adapt**: the structure module's per-level allowlist, directory-set helper,
  phase-mismatch and empty-phase checks, and placement hints must be ported onto
  the current module shape. The prototype's `nest` rebuilds findings with
  `issue(...)` and loses `severity`/`fix`; the current spread-based `nest` is
  kept and the delta recorded.
- **Adapt**: the store's directory entries and the `SpecFileEntry.kind` field
  onto the current recursive `readDirectory` listing, and the test-helper change.
- Record the prototype test case list (names only) as the coverage baseline for
  C002, and the old skill's layout sentences as input for D004.
- Change nothing outside this spec.

## Completion

- [x] MEMORY.md records the prototype commit hash and one verdict per hunk
- [x] Every "do not port" row names the current-tree replacement that covers it
- [x] The coverage baseline lists the prototype's structure test names, and the kept-`nest` deviation is stated
- [x] `git log -1 --oneline feat/phase-folders` and the branch are unchanged by this task
