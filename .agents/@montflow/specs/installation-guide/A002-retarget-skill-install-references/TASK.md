---
id: A002
name: retarget-skill-install-references
type: execution
originator: user
depends-on: A001
related-tasks: A001
status: complete
---

# Task A002: retarget-skill-install-references

## Type: execution

## Description

Remove the external `skills` CLI from the repository's documentation and replace
each use with the in-repo path. The `syncing-skills` skill is the main casualty:
it is written as a guided `npx skills add` installer and must become a
`mf-skills sync` flow.

## Requirements

- `grep -rn "npx skills"` over shipped docs and source (README, `guides`,
  `.agents/skills`, `.agents/documentation`, `packages`, `apps`) returns
  nothing; spec artifacts that describe the old state are out of scope.
- `syncing-skills` SKILL.md, GATES.md, and CHANGELOG.md describe the sync flow:
  register the reference (or use the local checkout), run `mf-skills sync`,
  verify with `--check`, report per-skill outcomes.
- `syncing-skills` keeps `metadata.internal: true`; sync must be documented as
  skipping it.
- Root `README.md` points at `guides/installation.md` for install and mentions
  `mf-skills sync` as the skills path, with no global-install instructions.
- `packages/skills/README.md` documents `sync` in its subcommand list and
  describes the public/internal split.
- Stale harness-specific hints that name the old installer are corrected:
  `packages/profiles/CLI.md`, the profiles interactive comment, the workspace
  skills service hint, and the command table in
  `.agents/documentation/author-mf-utility-cli.md`.
- No document tells a reader to install skills globally.

## Completion

- [ ] `grep -rn "npx skills" README.md guides packages apps .agents/skills .agents/documentation` finds nothing.
- [ ] The `syncing-skills` skill, both READMEs, and the utility-CLI doc describe
      `mf-skills sync`.
