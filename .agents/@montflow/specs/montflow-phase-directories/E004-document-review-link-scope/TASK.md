---
id: E004
name: document-review-link-scope
type: defect
originator: defect:C099
depends-on: D004
related-tasks: C002
status: complete
---

# Task E004: document review-link scope

## Type: defect

## Description

Record the review-link gap found in rounds 001–004 instead of leaving it as an
implicit "do not port" claim. `mf-specs check` calls `verifySpecTree` without
review series, so the task→round link is enforced only where a caller holds the
reviews store.

## Requirements

- State in `SPEC.md` that review-series binding is enforced by the workspace/TUI
  path (`apps/workspace` supplies the series; `verifySpecTree(snapshot, review)`
  is the contract) and that the specs package deliberately does not depend on
  the reviews store — `@montflow/reviews` depends on `@montflow/specs`, so the
  reverse edge would be a cycle.
- Correct A002's ReviewProbe row: "superseded for the layout work; the
  task→round link is enforced on the workspace path, not by `mf-specs check`" —
  not "no gap".
- Keep this out of the layout scope: no CLI wiring here.

## Completion

- [x] `SPEC.md` carries the scope statement; A002's row no longer claims there is no gap.
- [x] No code change; `bun run mf:check:specs` passes.
