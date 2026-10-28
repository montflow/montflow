---
id: B099
name: review-phase
type: review
originator: user
depends-on: B001, B002
related-tasks: B001, B002
reviewer-profiles: effect-reviewer
status: pending
---

# Task B099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase B.

Phase B contains a decision task, so the review must judge the decision as well as the code: whether the spike numbers support the choice, whether the rejected surfaces were rejected for real reasons, and whether the acceptance test could actually fail.

## Requirements

- Findings written to the phase review round.
- `B001-render-surface/MEMORY.md` (§ Handoff) is checked for evidence, not for prose quality.
- The viewer lifecycle is verified to leave no process behind.
- The collector path is re-checked for driver and network imports.

## Completion

- [ ] Findings written and reviewed.
