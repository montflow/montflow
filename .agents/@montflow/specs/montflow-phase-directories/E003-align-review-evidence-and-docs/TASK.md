---
id: E003
name: align-review-evidence-and-docs
type: defect
originator: defect:D099
depends-on: D004
related-tasks: D001, D002, D004
status: complete
---

# Task E003: align review evidence and docs

## Type: defect

## Description

Fix the evidence and wording findings: fixture tests that asserted membership
instead of counts, a fixtures README without a migrate example, a package README
missing `mock-stray`, a scaffold CONTEXT still describing the flat output, and
inventory/delta nits that misstate the prototype.

## Requirements

- `fixtures.test.ts` asserts exact issue counts: `mock-bad` 10, `mock-stale` 1,
  `mock-stray` 3.
- `fixtures/README.md` carries a `migrate --all --dry-run` example; the package
  README lists `mock-stray`.
- `modules/scaffold/CONTEXT.md` describes the nested output and the phase guard.
- A001's inventory records the workspace reader/test and the missing flat-path
  artifacts; the SPEC change-scope line includes `apps/workspace` and both skill
  copies.
- A002's prototype counts are corrected to the measured values (24 structure
  cases, 36 commits ahead).

## Completion

- [x] Fixture counts are asserted, not just field membership.
- [x] Both READMEs and the scaffold CONTEXT match the landed tree.
- [x] `bun run mf:check:specs` and `mf:check:skills` pass.
