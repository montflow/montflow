---
id: A099
name: review-phase
type: review
originator: user
depends-on: A004
related-tasks:
status: complete
---

# Task A099: Review Phase A

## Type: review

## Description

Independent subagent runs the `adversarial-review` skill over Phase A findings
and the locked contract. Findings at
`.agents/@montflow/reviews/runs-driven-agentic-flows/A.md`. Human accepts,
defers, or dismisses each before Phase B.

## Requirements

- Review covers backend choice, own-store persistence, and surface boundaries.
- No open finding without a human disposition.

## Completion

- [ ] Findings written to `.agents/@montflow/reviews/runs-driven-agentic-flows/A.md` and reviewed by human
