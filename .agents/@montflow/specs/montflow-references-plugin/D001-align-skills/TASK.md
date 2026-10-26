---
id: D001
name: align-skills
type: execution
originator: user
depends-on: C007, C006, B003
related-tasks:
status: pending
---

# Task D001: Align the skill surface

## Type: execution

## Description

Audit every skill that names references against the CLI that actually shipped.
C006 authored the two packaged skills against the plan; this task makes them
teach the real behaviour — add routing to update, agent-first output, `--human`
— and repoints every other skill that still mentions the retired generic
names or a registry table.

## Requirements

- Re-read the shipped CLI: `--help` for every verb, the `--human` / `--verbose` modes, add→update routing, `sync`, `status`, and `doctor`; treat that output as the contract.
- Update `montflow-add-reference` and `montflow-find-reference` pipelines to match exactly, including add→update routing and when to use `--human`; bump each version and add a changelog entry.
- Own the retirement note: the new skills' changelogs and the package README must say that `adding-references` / `finding-references` moved to `mf-references` and name the replacements, so a reader of the old names finds the new surface.
- Grep every skill root (`.agents/skills`, `packages/*/skills`) for `adding-references`, `finding-references`, `adding-vendor`, `finding-vendor`, and registry-table language; repoint or delete each hit.
- Update the `authoring-skills` groups table to the new names, and any `finding-skills`, `syncing-skills`, `executing-skills`, or `setup-agents` text that names the reference workflow.
- Confirm no non-`montflow-*` reference skill remains and the package ships exactly the two scoped skills.
- Run `mf-skills verify` on both packaged skills, `mf-references doctor --check`, and `mf:check:skills`; every check passes.
- No file outside `.agents/skills/`, `packages/references/`, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Both packaged skills teach the shipped CLI, including add→update and `--human`
- [ ] No stale generic reference name or registry table remains in any skill
- [ ] `mf:check:skills` and `mf-references doctor --check` pass
