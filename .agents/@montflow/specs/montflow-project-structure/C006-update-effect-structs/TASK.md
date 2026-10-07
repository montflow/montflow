---
id: C006
name: update-effect-structs
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C006: Update `effect-structs`

## Type: execution

## Description

Align `effect-structs` with B001 decision #20 (`Blueprint` optional) and the
naming/`.js` decisions.

## Requirements

- `Blueprint` is optional; omit it when the struct does not use it — update
  `SKILL.md`, `GATES.md`, and `templates/`.
- Apply the `Id` naming rule.
- Relative specifiers use `.js` — update templates and examples.
- Update `CHANGELOG.md`.

## Completion

- [ ] `SKILL.md`, `GATES.md`, and templates reflect optional `Blueprint`
