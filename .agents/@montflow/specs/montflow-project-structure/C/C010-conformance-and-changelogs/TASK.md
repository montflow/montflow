---
id: C010
name: conformance-and-changelogs
type: execution
originator: planner:B002
depends-on: C002, C003, C004, C005, C006, C007, C008, C009
related-tasks:
status: complete
---

# Task C010: Conformance sweep and changelogs

## Type: execution

## Description

Verify the whole workspace skill tree is schema-valid and that every changed
skill documents the release, completing the B002 deliverable.

## Requirements

- Run `bun run --cwd packages/pi-skills cli verify` and fix every reported issue.
- Confirm every changed skill carries a `CHANGELOG.md` entry for its new
  version.
- Confirm `montflow-typescript-project-structure` satisfies
  `authoring-skills` (three body sections, `id` unchanged, dependencies exist).
- Confirm no live reference to `typescript-conventions` or
  `typescript-result-over-throws` remains outside changelogs.
- Run `bun run --cwd packages/pi-specs cli check --dir $PWD/.agents/@montflow/specs --name montflow-project-structure`.

## Completion

- [ ] All workspace skills verify valid
- [ ] Changelogs updated
