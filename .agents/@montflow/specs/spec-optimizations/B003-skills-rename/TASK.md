---
id: B003
name: skills-rename
type: execution
originator: user
size: medium
depends-on: A003, B001
related-tasks:
status: complete
---

# Task B003: skills-rename

## Type: execution

## Description

Rename the six skills each package ships so the retired Pi infix is gone, and
move their installed mirrors with them. This covers package directories,
frontmatter, cross-references, doctor identities, and embedded payloads.

## Requirements

- Rename these package skill directories and their frontmatter `name`:
  - `packages/skills/skills/montflow-create-pi-skills` → `montflow-create-skills`
  - `packages/skills/skills/montflow-modify-pi-skills` → `montflow-modify-skills`
  - `packages/prompts/skills/montflow-create-pi-prompts` → `montflow-create-prompts`
  - `packages/prompts/skills/montflow-execute-pi-prompts` → `montflow-execute-prompts`
  - `packages/specs/skills/montflow-create-pi-specs` → `montflow-create-specs`
  - `packages/specs/skills/montflow-find-pi-specs` → `montflow-find-specs`
- Move the matching `.agents/skills/` mirrors, remove the old directories, and
  keep every mirror byte-identical to its package copy.
- Update in-skill cross-references (`dependencies:`, prose) to the new names and
  to the `.agents/@montflow/prompts/` path.
- Bump each renamed skill's version and add a CHANGELOG entry naming the rename.
  Do not rewrite older entries.
- Update the owning package code: `SKILL_NAMES` / `SPEC_SKILL_NAMES` and their
  exported aliases, `GENERATION_REQUIREMENTS` / `MODIFICATION_REQUIREMENTS`, and
  the type comments that name a skill.
- Regenerate every embedded payload that carries skill names:
  `bun run --cwd packages/skills generate:payload`,
  `bun run --cwd packages/prompts generate:payload`.
- Update package tests that hardcode the old names or paths, including the specs
  drift test and the CLI skill-docs tests.

## Completion

- [ ] No `montflow-*-pi-*` directory remains under `packages/*/skills` or `.agents/skills`
- [ ] `bun run mf:check:skills`, `mf:check:prompts`, and `mf:check:specs` pass
- [ ] Every embedded payload is regenerated and its equality test passes
- [ ] `bun run --cwd packages/skills test`, `--cwd packages/prompts test`, and `--cwd packages/specs test` pass
- [ ] `turbo lint:check --filter=@montflow/skills --filter=@montflow/prompts --filter=@montflow/specs` passes
