---
id: C004
name: update-typescript-file-structure
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C004: Update `typescript-file-structure`

## Type: execution

## Description

Align `typescript-file-structure` — the owner of tree layout — with the B001
decisions and the C001 module law.

## Requirements

- Relative specifiers use `.js` — update `SKILL.md`, `GATES.md`, and examples.
- `src/index.ts` is the package/service entry carve-out; all internals live in
  group folders.
- Tests are colocated inside the module.
- Align with `montflow-typescript-project-structure` without duplicating it.
- Update `CHANGELOG.md`.

## Completion

- [ ] `SKILL.md` and `GATES.md` reflect the decisions above
