---
id: A003
name: explore-dual-surface
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A003: Plan the extension + CLI surfaces

## Type: exploratory

## Description

Plan the dual-role surface over the shared run engine: a Pi extension and a
CLI, with the workspace consuming the package as a third (dependency) kind.

Use `@montflow/pi-profiles` as the reference: `extension.ts`,
`apps/interactive/`, `apps/cli/`, `pi` manifest metadata, and
`.pi/settings.json` registration. Decide the shared engine boundary all three
consumers call, and the package `pi.extensions`/`bin` entries.

## Requirements

- Directory/API layout for engine + extension + CLI.
- Exact manifest additions (`pi.extensions`, `bin`, exports).
- Install/detect path for the workspace (`pi list` probe) and for humans.
- List of commands/tools each surface exposes.

## Completion

- [ ] Findings summarized in MEMORY.md
