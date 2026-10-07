---
id: C006
name: document-verification
type: execution
originator: planner:B002
depends-on: C003, C004, C005
related-tasks:
status: complete
---

# Task C006: Document the verification gate

## Type: execution

## Description

Document the shared scripts, the extension verify commands, the hook install,
and the CI matrix, and point agents at the shared entry point.

## Requirements

- Document `verify:montflow`, `verify:montflow:fast`, `verify:montflow:extensions`, and the per-extension verify commands.
- Document `bun run hooks:install` and the `--no-verify` bypass.
- Update the verification section of `AGENTS.md` so agents run the shared entry point rather than ad-hoc commands.
- Note that `release.yml` is unchanged and why.

## Completion

- [x] Docs updated and consistent with the implemented scripts, hook, and workflow
