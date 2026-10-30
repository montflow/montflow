---
name: montflow-references-tui
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-29
locked-phases:
---

# References TUI panel

## Description

Give the reference store a face in the workspace TUI: a `references` panel
beside skills, prompts, profiles, and specs, listing each entry with its sync
state and opening its path. Split out of `montflow-references-plugin` so the
registry migration can land first.

## Requirements

- A `references` panel in the workspace grid, shaped like the prompts panel.
- One row per entry: slug, purpose, pin, clone path, and a state of `synced`,
  `missing`, `dirty`, `foreign`, `ref-mismatch`, or `invalid`.
- A pure, tested read-only summary seam in `@montflow/references`; no network,
  no implicit fetch.
- `/references` or the extended `/workspace` focuses the panel.
- Missing and empty stores render guidance, never a blank frame.

## Tasks

| ID   | Name                | Type      | Status  | Gates |
| ---- | ------------------- | --------- | ------- | ----- |
| G001 | add-references-panel | execution | pending | Yes   |
| G002 | wire-tui-seams       | execution | pending | Yes   |
| G099 | review-phase         | review    | pending | No    |
