---
id: C003
name: update-typescript-modules
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C003: Update `typescript-modules`

## Type: execution

## Description

Align `typescript-modules` — the owner of the module shape — with the B001
decisions and the C001 module law.

## Requirements

- Open-ended group registry: retire `layers/`, add `structs`; state that groups
  are plural and open-ended.
- Relative specifiers use `.js` — update `SKILL.md`, `GATES.md`, and examples.
- `CONTEXT.md` is conditional and applies to leaf modules only; include the
  observed template (`# Title`, intro, `## Belongs here`, `## Does not belong
  here`).
- Explicit return types are scoped to exported/public-API functions; internal
  functions infer.
- Align the module law with `montflow-typescript-project-structure` without
  duplicating it.
- Update `CHANGELOG.md`.

## Completion

- [ ] `SKILL.md` and `GATES.md` reflect the decisions above
