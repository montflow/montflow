---
id: B004
name: live-refs
type: execution
originator: user
size: medium
depends-on: B001, B002, B003
related-tasks:
status: complete
---

# Task B004: live-refs

## Type: execution

## Description

Finish the rename where the legacy name is referenced rather than shipped: the
two workspace profile skills, the profiles module, profile frontmatter, prompt
`skills` arrays, docs, and workspace services. Historical records stay as they
are.

## Requirements

- Rename the workspace skills `.agents/skills/montflow-create-pi-profiles` →
  `montflow-create-profiles` and `montflow-modify-pi-profiles` →
  `montflow-modify-profiles`. Update frontmatter `name`, `dependencies`, prose,
  and add a new CHANGELOG entry; do not rewrite older entries.
- Rename `packages/profiles/src/modules/pi-profiles/` to `profiles/`, its
  namespace `PiProfiles` to `Profiles`, and update every import, export, test
  suite name, and comment that uses it.
- Update `GENERATION_REQUIREMENTS`, `MODIFICATION_REQUIREMENTS`, and the profile
  skill list in `packages/profiles` to the new skill names.
- Update `.agents/@montflow/profiles/**/PROFILE.md` frontmatter `skills` arrays
  and prose that names an old skill or the old prompt path.
- Update the `skills` arrays in `.agents/@montflow/prompts/spec-create.json` and
  `spec-execute.json` to the renamed skills.
- Update live docs: `README.md`, `AGENTS.md`, `packages/skills/README.md`,
  `packages/prompts/README.md`, `packages/specs/README.md`,
  `packages/profiles/CLI.md`, `.agents/skills/authoring-skills/SKILL.md`, and the
  live renderer string in `packages/reviews/src/apps/cli/renderers.apps.module.ts`.
- Update workspace services and tests that hardcode the old skill names.
- Leave completed spec records, `MEMORY.md` history, and existing CHANGELOG
  entries untouched.

## Completion

- [ ] `grep -rn "pi-prompts\|pi-specs\|pi-skills\|pi-profiles" packages apps .agents --exclude-dir=node_modules` finds only historical records and changelogs
- [ ] `bun run mf:check:skills`, `mf:check:prompts`, `mf:check:specs`, `mf:check:profiles`, and `mf:check:reviews` pass
- [ ] `bun run --cwd packages/profiles test`, `lint:check`, `format:check`, and `ts:check` pass
- [ ] `bun run --cwd apps/workspace test` passes
- [ ] `bun run mf:gate:fast` passes
