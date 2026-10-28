---
id: B002
name: draft-unified-skill
type: planning
originator: user
depends-on: B001
related-tasks:
status: complete
---

# Task B002: Draft the unified skill

## Type: planning

## Description

Turn the B001 decisions into a concrete contract for the unified entry-point
skill, plus the ordered outline of the implementation tasks that will author
and wire it. This keeps the implementation open-ended while making the next
step explicit.

## Requirements

- Specify the unified skill: name, frontmatter (description, groups, dependencies), `# When To Use` / `# Pipeline` / `# Reference` body, and how it delegates to each depended-on skill.
- Specify how naming and structural rules from B001 are expressed once, in the entry point, without restating the individual skills.
- Produce an ordered outline of implementation tasks (create skill, adjust dependent skills, add tests/docs, gates) for authoring in a later phase.
- Flag anything still undecided as an open question for the next phase.
- No files outside `.agents/@montflow/specs/` are modified.

## Completion

- [x] Contract and implementation outline captured in MEMORY.md
