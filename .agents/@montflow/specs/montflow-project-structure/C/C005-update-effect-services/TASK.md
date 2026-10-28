---
id: C005
name: update-effect-services
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C005: Update `effect-services`

## Type: execution

## Description

Align `effect-services` with B001 decision #4 (service tag API), #12 (service
test layers), and the naming/`.js` decisions.

## Requirements

- `Context.Service` is the canonical tag API — update `SKILL.md`, `GATES.md`,
  `templates/`, and `examples/`. `ServiceMap.Service` must appear nowhere.
- Fix the frontmatter description so it no longer says `ServiceMap.Service`.
- Service test layers live in the service module alongside `Default`, built with
  `Layer.effectContext`.
- Apply the `Id` naming rule and `.js` relative specifiers.
- Update `CHANGELOG.md`.

## Completion

- [ ] Every file in the skill is consistent with `Context.Service`
