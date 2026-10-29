---
id: C005
name: implement-plugin-tools
type: execution
originator: user
depends-on: C004, B003
related-tasks:
status: complete
---

# Task C005: Implement the plugin entry and tools

## Type: execution

## Description

Wire the OpenCode server entry: register `/mf-references`, expose
`reference_add` and `reference_find`, and keep every tool deterministic over
the C004 engines. The TUI entry stays an id-only no-op unless B003 justified a
panel.

## Requirements

- Implement `src/server.ts` with `entry(ID, …)`, a stable plugin id, the slash command name/description, and command registration over `Cli.run`.
- Implement `reference_add` with the B003 input schema, calling the add engine and returning a displayable success or failure string.
- Implement `reference_find` with the B003 input schema, matching name, URL, purpose, and notes, and returning the entry plus clone state.
- Add any additional tool B003 approved (`reference_sync`, `reference_status`, `reference_update`, or `reference_remove`) over the same engines; do not invent a tool the decision did not name.
- Do not dispatch a session from any tool; assert this with a test that fails if a session port is called.
- Implement `src/tui.ts` as the id-only no-op (or the panel B003 approved), and keep both entrypoints loadable from the package.
- Cover the server entry with a test using the fake ports the sibling packages use: command registered, tools registered, failures displayable.
- `bun run --cwd packages/references test` and `ts:check` pass.
- No file outside `packages/references/` and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Server entry registers the slash command and the approved tools
- [ ] Tools are deterministic and return displayable strings
- [ ] TUI entry decided and implemented; server tests pass
