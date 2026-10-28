# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.
# C002: add-shared-tui-picker - Memory

Need to add shared TUI picker to @montflow/opencode. 
- Use renderer.currentFocusedEditor.insertText with retry (host API has no supported composer write)
- Use ui.dialog.select for picker
- Use keymap.layer for slash commands
- Support forwarding non-list args to server command of same name via client.session.command
- Follow host API patterns from main/.agents/references/opencode
