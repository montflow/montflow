---
id: C006
name: ship-skills-and-doctor
type: execution
originator: user
depends-on: C004, B003
related-tasks:
status: complete
---

# Task C006: Ship the skills and doctor

## Type: execution

## Description

Author the two `montflow-*` skills, generate the embedded payload, and
implement `doctor` so a workspace gets the skills installed, the registry
checked, and the clone root correctly ignored. This is the task that makes the
reference workflow discoverable to an agent without a source checkout.

## Requirements

- Author `packages/references/skills/montflow-add-reference/SKILL.md` and `montflow-find-reference/SKILL.md` to the full montflow skill standard: frontmatter (`name`, `description`, `id`, `author`, `version`, `license`, `groups`, `dependencies`) and `# When To Use` / `# Pipeline` / `# Reference` body.
- Make both skills call the CLI (`mf-references` / `/mf-references`) instead of carrying a registry table; the find skill resolves against the store, offers `sync` for a missing entry, and reports path, purpose, URL, and ref; the add skill runs the add flow, which routes to `update` when the reference is already registered.
- Add `CHANGELOG.md` for each skill with the migration note for the retired `adding-references` / `finding-references` names.
- Add `scripts/generate-embedded-skills.ts` and the generated payload file, following the sibling packages' generator and drift-test pattern.
- Implement `src/apps/doctor` across two concerns: (a) the workspace — clone root exists, `.gitkeep` present, `.gitignore` carries `.agents/references`, registry entries parse; (b) the packaged skills — install missing, rewrite stale, report mismatched file sets.
- Honour `--check`: report only, write nothing, exit 1 when unhealthy; never fail when no clone exists.
- Add the `doctor` command to the binary and slash command trees.
- Cover install, repair, stale, mismatched, payload-drift, changelog-version, missing-ignore-rule, and missing-`.gitkeep` cases with tests.
- `bun run --cwd packages/references generate:payload`, `test`, and `ts:check` pass.
- No file outside `packages/references/` and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Two `montflow-*` skills satisfy the full standard and call the CLI
- [ ] Doctor checks the registry, clone root, ignore rule, and skill payload
- [ ] `--check` is report-only; embedded payload is generated and drift-tested
