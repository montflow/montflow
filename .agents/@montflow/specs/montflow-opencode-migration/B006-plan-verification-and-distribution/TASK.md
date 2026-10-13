---
id: B006
name: plan-verification-and-distribution
type: planning
originator: user
depends-on: A005, B001
related-tasks:
status: pending
---

# Task B006: Plan verification and distribution

## Type: planning

## Description

Specify how the migrated packages are verified locally and in CI, and how they
are distributed, without weakening the existing `verify:montflow` gate.

## Requirements

- Specify the turbo tasks, tests, and the plugin-loader smoke test each migrated package carries.
- Specify the adapter contract tests that run without a running OpenCode server.
- Specify how the existing `verify:montflow` gate absorbs the new packages without weakening, and what it cannot cover headlessly.
- Specify the distribution path (peer deps, version pins, Git versus npm) and its Changesets and CI impact.
- Specify the compatibility pins (Effect, OpenTUI, Solid) and the check that catches drift.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Per-package verification plan recorded
- [ ] Distribution path and version pins recorded
- [ ] `verify:montflow` and CI impact captured
