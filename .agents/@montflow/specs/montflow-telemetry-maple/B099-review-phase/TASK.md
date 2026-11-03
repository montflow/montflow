---
id: B099
name: review-phase
type: review
originator: user
depends-on: B004
related-tasks: B001, B002, B003, B004
reviewer-profiles:
status: pending
---

# Task B099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase B.

## Requirements

- Findings written to the phase review round.
- One review round only — no re-review round; the phase is decisions, not code.
- Cap each finding at `Max Attempts: 2`; escalate rather than loop.

## Completion

- [ ] Findings written and reviewed.