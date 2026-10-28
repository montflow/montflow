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

Independent subagent runs the `adversarial-review` skill over the Phase A
inventory and the proposed CI + hook shape. Findings land at
`.agents/@montflow/reviews/montflow-ci-verification/A.md`. The human accepts,
defers, or dismisses each before Phase B.

## Requirements

- Review covers completeness of the workflow/script inventory, correctness of the extension-verification table, and whether the candidate shape actually closes the coverage gap.
- Verify that hook claims account for the bare-repo worktree layout.
- No open finding without a human disposition.

## Completion

- [x] Findings written to `.agents/@montflow/reviews/montflow-ci-verification/A.md` and reviewed by the human
