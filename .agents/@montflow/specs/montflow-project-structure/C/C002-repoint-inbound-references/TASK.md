---
id: C002
name: repoint-inbound-references
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C002: Repoint inbound references to the renamed skill

## Type: execution

## Description

The rename in C001 leaves two live inbound references to
`typescript-conventions`. Repoint them at the new skill name.

## Requirements

- Update `.agents/skills/typescript-prefer-inference/SKILL.md` where it links
  `typescript-conventions`.
- Update `.agents/skills/authoring-skills/SKILL.md` where it lists
  `typescript-conventions`.
- Leave historical `CHANGELOG.md` mentions untouched.
- Modify nothing else.

## Completion

- [ ] Both inbound references point at `montflow-typescript-project-structure`
- [ ] No live (non-changelog) reference to `typescript-conventions` remains
