---
id: D001
name: explore-workspace-integration
type: exploratory
originator: user
depends-on: C099
related-tasks:
status: complete
---

# Task D001: Map workspace integration points

## Type: exploratory

## Description

Map the workspace side now that the engine exists: how `apps/workspace` imports
`@montflow/pi-runs` (dependency vs extension), the `runs` service surface, the
`app.tsx` flow mutations and `runDetail*` signals, `run-detail.tsx`, toasts, and
keybinds. List exact functions/signals to change and what must not regress
(skills, prompts, manual flows).

## Requirements

- Table of touch points with file + line.
- Chosen integration shape: dependency API vs spawning the installed extension.
- Run-detail interaction gaps enumerated.

## Completion

- [ ] Findings summarized in MEMORY.md
