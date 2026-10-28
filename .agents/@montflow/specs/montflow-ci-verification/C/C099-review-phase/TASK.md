---
id: C099
name: review-phase
type: review
originator: user
depends-on: C007
related-tasks:
status: complete
---

# Task C099: Review Phase C

## Type: review

## Description

Independent subagent runs the `adversarial-review` skill over the Phase C
implementation. Findings land at
`.agents/@montflow/reviews/montflow-ci-verification/C.md`. The human accepts,
defers, or dismisses each before the spec is locked.

## Requirements

- Review covers the new extension verifies, the root scripts, the workflow matrix, the Lefthook hook, and the docs.
- Confirm every extension has a gate-runnable verify and that `verify:montflow` runs them all.
- Confirm `release.yml` is unchanged and the boundary is documented.
- Confirm the hook works under the worktree layout and `--no-verify` bypasses it.
- No open finding without a human disposition.

## Completion

- [x] Findings written to `.agents/@montflow/reviews/montflow-ci-verification/C.md` and reviewed by the human
