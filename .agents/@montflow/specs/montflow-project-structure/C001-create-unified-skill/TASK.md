---
id: C001
name: create-unified-skill
type: execution
originator: planner:B002
depends-on: B002
related-tasks:
status: complete
---

# Task C001: Create the unified entry-point skill

## Type: execution

## Description

Author `montflow-typescript-project-structure` by repurposing
`typescript-conventions` in place, exactly as contracted in
`B002-draft-unified-skill/MEMORY.md`.

## Requirements

- Rename the directory `.agents/skills/typescript-conventions/` to
  `.agents/skills/montflow-typescript-project-structure/`.
- Rewrite `SKILL.md`: keep the frontmatter `id` `19088d58133341e3`; set `name`
  to the directory name, `version` `3.0.0`, the B002 description, and YAML
  `groups` / `dependencies` lists.
- `dependencies` are `executing-skills`, `mimicking-conventions`,
  `typescript-file-structure`, `typescript-modules`,
  `setup-typescript-package`, `effect-services`, `effect-structs`,
  `effect-testing`, `effect-v4`, `typescript-prefer-inference`.
- `typescript-result-over-throws` is neither a dependency nor referenced.
- Body is `# When To Use` / `# Pipeline` / `# Reference`. The module law is
  stated as principles, each concrete rule naming its owning skill; no rule text
  is copied from a dependency.
- The pipeline lists `mimicking-conventions` as the pre-write step and routes
  every Effect/service/struct/test concern to its owning skill.
- Update the skill `CHANGELOG.md` with a `3.0.0` entry.
- Modify nothing outside `.agents/skills/montflow-typescript-project-structure/`.

## Completion

- [ ] Directory renamed and `SKILL.md` rewritten to the B002 contract
- [ ] `CHANGELOG.md` carries the `3.0.0` entry
