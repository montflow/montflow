---
id: B002
name: draft-ci-plan
type: planning
originator: planner:B001
depends-on: B001
related-tasks:
status: complete
---

# Task B002: Draft the CI implementation plan

## Type: planning

## Description

Turn the B001 decisions into a concrete, ordered implementation plan that
Phase C can execute without re-deciding anything.

## Requirements

- Specify the workflow file path and name, triggers, permissions, concurrency, timeouts, jobs, matrix, and caching.
- Specify each shared root script: its name, exact commands, and exit behaviour.
- Specify the pre-push hook file path, its contents, and the one-command installer.
- Specify the exact `release.yml` change, or the rationale for leaving it untouched.
- Specify the documentation changes (AGENTS.md verification section, README, workflow comments).
- Produce an ordered list of implementation tasks with dependencies and, for each, the gate it must pass.
- State that the extension verifications run from this repo against this repo's own artifacts, with the resolved paths.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Implementation plan and task outline captured in MEMORY.md
