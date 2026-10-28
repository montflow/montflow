---
id: C002
name: add-shared-tui-picker
type: execution
originator: user
depends-on: C001
related-tasks: B001, C001
status: in-progress
---

# Task C002: add-shared-tui-picker

## Type: execution

## Description

Implement the picker contract B001 specified, once, in `@montflow/opencode`. Today
the only working picker is a hand-written TUI part inside `.opencode/plugins/`;
the goal is that no plugin ever writes dialog, search, or insertion code again.

## Requirements

- The contract lives in `@montflow/opencode` (or the seam B001 chose) and exports
  a function a package's `tui.ts` calls with: a stable command id, a slash name,
  a title, a reader returning option rows, and a formatter returning inserted
  text.
- The shared implementation owns `keymap.layer` registration, `ui.dialog.select`,
  case-insensitive search over title and description, and insertion.
- Insertion targets the composer after the dialog restores focus, with the
  retry and user-visible failure path the stopgap proved necessary.
- Empty stores and unreadable stores produce a toast, never a silent no-op.
- The contract is covered by unit tests where the host objects can be faked:
  option mapping, search filtering, insertion text, empty-store message.
- Package checks pass for `@montflow/opencode`: `test`, `ts:check`,
  `lint:check`, `format:check`.

## Completion

- [ ] Shared picker exported and tested.
- [ ] The prompts stopgap's TUI part is replaced by a call to it.
- [ ] Scoped checks green.
