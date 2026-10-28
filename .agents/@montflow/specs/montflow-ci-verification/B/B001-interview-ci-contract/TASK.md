---
id: B001
name: interview-ci-contract
type: planning
originator: user
depends-on: A099
related-tasks:
status: complete
---

# Task B001: Interview the user on the CI contract

## Type: planning

## Description

Present the A004 matrix and the open decisions to the user and settle the
CI + hook contract. This is a user-decision task: capture their choices, do
not decide for them.

## Requirements

- Settle trigger scope: push to `main` only, or also pull requests and other branches.
- Settle the job layout and whether checks are repo-wide or per-package/sharded.
- Settle the pre-push hook mechanism and its install path from A003.
- Settle the shared entry-point script names and exactly what each runs.
- Settle what happens to the per-package checks in `release.yml`.
- Settle which extension verifications are required and which are optional, respecting the headless constraints from A002.
- Record every decision with the user's rationale; leave genuinely deferred questions explicitly open.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Decisions captured in MEMORY.md
