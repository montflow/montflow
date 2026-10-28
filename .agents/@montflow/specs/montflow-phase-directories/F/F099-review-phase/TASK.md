---
id: F099
name: review-phase
type: review
originator: user
depends-on: F001, F002
related-tasks: E099
reviewer-profiles: effect-reviewer
status: pending
---

# Task F099: Review phase

## Type: review

## Description

Review the reconciliation and the gap audit before the branch is proposed for
merge. The reconciliation is the last place a main-side change can be lost, and
the audit is the last place a stale layout claim can survive.

## Requirements

- Verify F001: the merge really contains `origin/main` (or the no-op counts are
  correct), every conflict resolution kept both sides' intent, and the quoted
  gates were run after the merge, not before.
- Verify F002: the sweep is reproducible, the exclusion list is honest, and every
  gate-breaking hit is named with an owner. Spot-check three hits against the
  repo yourself.
- Confirm no phase-E deferral silently reappears and that `SPEC.md` still
  describes the split with `montflow-spec-standard/C001`.
- Findings written to the phase review round.

## Completion

- [ ] Findings written and reviewed.
- [ ] Every gate-breaking gap has an owner or a recorded decision.
