---
id: B099
name: review-phase
type: review
originator: user
depends-on:
related-tasks:
status: complete
---

# Task B099: Review phase B

## Type: review

## Description

Run an independent adversarial review over phase B. The phase produces
decisions, so the review tests whether each is justified by the phase A
evidence and whether the rollout is genuinely backward-compatible and
reversible.

## Requirements

- Findings written to the phase review round of the `montflow-multi-reviewer` review series.
- Each decision checked against the A-task evidence it cites; unsupported decisions recorded as findings.
- The series naming and profile declaration challenged for collisions and slug edge cases.
- The rollout challenged for a broken existing spec, an unhandled unknown profile, and a missing rollback.

## Completion

- [ ] Findings written and reviewed
