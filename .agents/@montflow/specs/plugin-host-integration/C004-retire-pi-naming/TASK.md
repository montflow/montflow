---
id: C004
name: retire-pi-naming
type: execution
originator: user
depends-on: C003
related-tasks: C001
status: in-progress
---

# Task C004: retire-pi-naming

## Type: execution

## Description

The Pi migration is finished, but the prompts utility still names Pi on every
user-facing surface: the store is `.agents/@montflow/pi-prompts`, the picker was
registered as `/prompts`, the packaged skills are `montflow-create-pi-prompts` and
`montflow-execute-pi-prompts`, and the CLI's help, refusals, and docs repeat the
path. Typing the picker and being told about `pi-prompts` is the symptom.

This task removes the Pi-era naming from everything a user or agent reads or
types. It changes names only; behaviour and file formats stay as they are.

## Requirements

- Rename the store to `.agents/@montflow/prompts`. Existing workspaces that still
  have `.agents/@montflow/pi-prompts` keep working: the CLI and plugin read the
  legacy directory when the new one is absent, and `doctor` moves it into place
  and reports what it moved.
- Rename the packaged skills to `montflow-create-prompts` and
  `montflow-execute-prompts`, and regenerate the embedded payload so `doctor`
  installs the new names.
- Every command a user types is namespaced and there is exactly one prompts
  command: `/mf-prompts`. With no arguments or `list` it opens the picker; every
  other verb runs headless. No bare `/prompts` and no second `/mf-prompts-tui`.
- No user-facing string names Pi: CLI help, refusals, fix lines, toasts, renderer
  output, README, installation guide, and the packaged skills.
- Historical records are left as written: existing spec and review directories
  under `.agents/@montflow/specs/` and `.agents/@montflow/reviews/` are not
  renamed.
- Scoped checks pass for every package touched, plus `bun run mf:check:prompts`.

## Completion

- [ ] Store, skills, commands, and user-facing strings carry no Pi-era name.
- [ ] Legacy store directory is migrated by `doctor` and covered by a test.
- [ ] Scoped checks and `mf:check:prompts` green.
