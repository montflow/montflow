---
id: D002
name: align-docs-and-verify
type: execution
originator: user
depends-on: D001
related-tasks:
status: pending
---

# Task D002: Align the docs and verify

## Type: execution

## Description

Bring every workspace doc that names the reference surface in line with the
shipped package, then run the full gate. C007 wired the package into the repo;
this task makes the human- and agent-facing prose agree with it and proves the
whole spec landed.

## Requirements

- Update root `README.md`: the package list, the skill-sync matrix, and the `@montflow/references` entry with its two skill names.
- Update `INSTALL.md`: the private-plugin list and the install commands for `packages/references`.
- Update `AGENTS.md`: the verification scope list, the gate description, and the CLI/plugin commands that mention references.
- Update `.agents/documentation/author-mf-utility-cli.md`: the current-surface table, the new verbs, and the `--human` / `--verbose` convention.
- Update the Lefthook comment if it enumerates the verify scopes; confirm `.github/workflows/verify.yml` and root `package.json` already carry `mf:check:references`.
- Add or update changelog entries for every touched artifact that carries one; state the migration in the package README.
- Run the full gate once here because this task closes the spec; earlier tasks use scoped checks. `bun run mf:check`, `bun run mf:gate:fast`, and `bun run --cwd packages/references test` all pass, and `bun run --cwd packages/specs cli check --dir $PWD --name montflow-references-plugin` reports zero issues.
- No file outside the named docs, the package, `package.json`, CI config, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] README, INSTALL, AGENTS, and the CLI guide describe the shipped surface
- [ ] Changelogs are current and the migration is stated
- [ ] `mf:check`, `mf:gate:fast`, the package tests, and the spec check pass
