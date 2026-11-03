---
id: C099
name: review-phase
type: review
originator: user
size: medium
depends-on: C006, C007, C008, C009
related-tasks:
status: pending
---

# Review Phase C: review phase

## Type: review

## Description

An independent hostile review of the whole overhaul: did the shipped structure match the
decisions, did anything that was supposed to be deleted survive, and is the store
self-consistent end to end.

## Requirements

- Audit B001's delete list end to end: no surviving check for the reserved review task id, no hand-written lock list, and no contradiction state that policed it.
- Verify the deletes actually happened and that no dead test, dead fixture, stale skill text, or flat-phase CLI/TUI path was left behind.
- Confirm the severity channel stayed additive: no pre-existing failure changed its verdict.
- Confirm the end-to-end claim by running the repo-wide gate and the clean-clone install rather than reading the changelog.
- Confirm every migrated spec still reads and still verifies, and the TUI never offers a phase directory as a spec.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Review written as a round under `.agents/@montflow/reviews/montflow-spec-standard/<NNN>/REVIEW.md` (not a flat `C.md`) with `- Phase: C` in `## Metadata`, and the series ledger `.agents/@montflow/reviews/montflow-spec-standard/REVIEW.md` indexes the round
- [ ] Accepted findings opened as defect tasks with dispositions recorded
- [ ] `bun run mf:check` green and a clean clone gains every payload kind
