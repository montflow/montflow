---
id: E001
name: wire-profile-create
type: execution
originator: user
depends-on: D099
related-tasks:
status: complete
---

# Task E001: Wire agentic profile creation to runs

## Type: execution

## Description

Refactor the profiles panel create flow: agentic creation gates on the runs
extension, dispatches an author run through the D002 runner, toasts the run with
a keybind to its detail page, and on completion refreshes profiles and opens the
created profile. Manual creation and all other agentic flows stay unchanged.

## Requirements

- Missing runs extension → install prompt (mirrors skills/profiles install).
- Dispatch toast names the run and carries a "go to run" keybind.
- Completion displays the created profile (detail + list refresh).
- No `Skills.runHeadlessAgent` on the profile-create path.

## Completion

- [ ] Agentic profile creation dispatches a run end to end
- [ ] Tests pass (`bun run --cwd apps/workspace test`)
- [ ] Output summarized in MEMORY.md
