---
id: C099
name: review-phase
type: review
originator: user
size: medium
depends-on: C006, C007
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

- Hunt for leftover v1 artifacts: any surviving check for the reserved review task id, the hand-written lock list, or the contradiction state that policed it.
- Verify the deletes actually happened and that no dead test, dead fixture, or stale skill text was left behind.
- Confirm the severity channel stayed additive: no pre-existing failure changed its verdict.
- Confirm the end-to-end claim by running the repo-wide gate and the clean-clone install rather than reading the changelog.
- Confirm the two complete specs still read and still verify.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/C.md` and read by the human
- [ ] Accepted findings opened as defect tasks with dispositions recorded
- [ ] `bun run verify:montflow` green and a clean clone gains every payload kind
