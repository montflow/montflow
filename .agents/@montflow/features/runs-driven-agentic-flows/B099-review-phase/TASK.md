---
id: B099
name: review-phase
type: review
originator: user
depends-on: B003
related-tasks:
status: complete
---

# Task B099: Review Phase B

## Type: review

## Description

Independent subagent runs the `adversarial-review` skill over the run engine
and mode work. Findings at
`.agents/@montflow/reviews/runs-driven-agentic-flows/B.md`.

## Requirements

- Review covers store-rule compliance, settle-once, own-store integrity, hook safety.
- No open finding without a human disposition.

## Completion

- [ ] Findings written to `.agents/@montflow/reviews/runs-driven-agentic-flows/B.md` and reviewed by human
