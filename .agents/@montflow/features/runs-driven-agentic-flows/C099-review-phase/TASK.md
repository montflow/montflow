---
id: C099
name: review-phase
type: review
originator: user
depends-on: C003
related-tasks:
status: complete
---

# Task C099: Review Phase C

## Type: review

## Description

Independent subagent runs the `adversarial-review` skill over the extension and
CLI surfaces. Findings at
`.agents/@montflow/reviews/runs-driven-agentic-flows/C.md`.

## Requirements

- Review covers surface parity, manifest correctness, and tool safety.
- No open finding without a human disposition.

## Completion

- [ ] Findings written to `.agents/@montflow/reviews/runs-driven-agentic-flows/C.md` and reviewed by human
