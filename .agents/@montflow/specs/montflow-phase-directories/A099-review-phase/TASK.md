---
id: A099
name: review-phase
type: review
originator: user
depends-on: A001, A002, A003
related-tasks:
reviewer-profiles:
status: complete
---

# Task A099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase A: the current-tree inventory,
the prototype delta table, and the layout/migration decision. Challenging the
decision matters more than checking that the files exist.

## Requirements

- Verify A001's inventory against the tree itself: every assumption-bearing site
  in `packages/specs` and `packages/reviews` is classified, and nothing that
  reads a task path is missing.
- Verify A002's "do not port" rows against the current `reviewer-profiles` and
  `modules/review-link` contract; flag any superseded piece that would have
  covered a real gap.
- Verify A003's ours/C001 split covers every overlapping artifact once, and that
  no decision quietly assumes `PHASE.md`, a version field, or derived locks.
- Verify the prototype read was read-only: `feat/phase-folders` and `f17365f`
  are unchanged.
- Findings written to the phase review round.

## Completion

- [x] Findings written and reviewed.
- [x] Every finding names the artifact and the consequence, not just the absence.
