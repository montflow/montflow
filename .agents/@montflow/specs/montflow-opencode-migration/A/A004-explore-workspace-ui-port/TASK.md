---
id: A004
name: explore-workspace-ui-port
type: exploratory
originator: user
depends-on: A002
related-tasks:
status: complete
---

# Task A004: Map the workspace and TUI widgets onto OpenCode surfaces

## Type: exploratory

## Description

Map the workspace application and the `pi-interactive` widgets onto OpenCode's
TUI plugin surfaces. Establish which target surface (plugin route, session
panel, or slot) each panel and overlay uses, and what the workspace can no
longer host once the main-session layout is owned by OpenCode.

## Requirements

- Inventory the workspace's panels (Info, Skills, Profiles, Prompts, Sessions, Specs), overlays, keybinds, grid layout source, and its `pi` shell-outs.
- Map each panel and overlay to a target surface: fullscreen plugin route, `session.panel`, or a slot (`session.composer.top`, `sidebar.content`, `sidebar.footer`, `prompt.footer`, `home.footer`).
- Map `pi-interactive` widgets (filter-select, menu, model-picker, loading) and `ctx.ui.custom` onto `@opencode/plugin/tui` dialogs, slots, and Solid components.
- Under the retire-`pi-sessions` hypothesis, record that the workspace's session detail, dispatch, steering, and interrupt reuse OpenCode's native session view and subagent sessions, and that the receipt/lifecycle overlay is dropped or reduced to a minimum.
- Record the renderer/component gap: workspace OpenTUI/Solid versions versus the plugin peer range, and which workspace components port unchanged.
- State where the configurable grid and the session transcript can live, and what the main-session layout cannot host.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Per-panel surface mapping captured in MEMORY.md
- [ ] Widget/dialog mapping and the OpenTUI version gap recorded
- [ ] Native-session reuse noted, receipt overlay fate recorded
