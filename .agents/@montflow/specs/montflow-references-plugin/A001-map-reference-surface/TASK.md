---
id: A001
name: map-reference-surface
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Map the reference surface

## Type: exploratory

## Description

Inventory every artifact that makes up the current reference workflow — the
skills, the registry, the clone root, the ignore rules, and the prose that
describes them — so the package requirements are grounded in what exists
rather than what the skills claim. Record exact paths, line numbers, and the
current registry contents.

## Requirements

- Inventory the two skills (`adding-references`, `finding-references`): path, frontmatter, version, groups, pipeline steps, and every command they tell an agent to run.
- Record the registry as it exists today: the 14 rows in `finding-references/SKILL.md`, with name, URL, and whether the clone exists locally. Name the file and line range that holds the table.
- Record the clone root: `.agents/references/` contents, the committed `.gitkeep`, and the `.gitignore` entry that hides clones (path and line).
- Record every other artifact that names references: `authoring-skills` groups table, `authoring-skills` body, `.agents/documentation`, root README/INSTALL/AGENTS, and any package script or CI cell.
- Record what is missing today: no store, no machine-readable registry, no verifier, no add/update/sync/status lifecycle, no CLI, no tools, no doctor, no `mf:check` scope.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Skill inventory and registry contents captured in MEMORY.md with paths and line numbers
- [ ] Clone root, ignore rule, and naming docs captured
- [ ] Missing capabilities listed explicitly
