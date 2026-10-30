---
id: A002
name: implement-config-store
type: execution
originator: planner:A001
depends-on: A001
related-tasks:
status: complete
---

# Task A002: Implement the config store

## Type: execution

## Description

Replace the `opencode.jsonc` editor with an owned store, keep the host-config
options path as a compatibility fallback, and make a valid edit take effect
without restarting the host.

## Requirements

- Add the store module: locate (`<root>/.agents/@montflow/model-fallback/config.json`), read, decode with shape issues, write atomically with preserved unknown keys, delete, and a change stream.
- Share one schema between the plugin, CLI, and verifier; shape issues name the offending field.
- Activation resolves store → `opencode.jsonc` options → idle, logs the source, and subscribes to store changes inside the plugin scope: valid change swaps the active configuration, invalid change keeps the last good one and logs every issue, deletion falls back to options or idle.
- Retry and resume paths read the current configuration, so a swap applies to the next failure without re-registering hooks.
- `show`, `set`, and `remove` operate on the store. `set` rejects shape errors and unknown models as today. `migrate` moves an existing options block into the store, writes it, and clears the options while keeping the plugin entry.
- The TUI face and the packaged prompt use the store path and the same commands.
- Update the README and module `CONTEXT.md` files; the store becomes the only documented location.
- Tests cover: write/read round-trip with unknown keys preserved, store-over-options precedence, options-only fallback, idle with neither, valid change applied at runtime, invalid change rejected with the last good config retained, and deletion.

## Completion

- [ ] Store module and shared schema implemented
- [ ] Activation resolution, watch, and last-good behavior implemented
- [ ] CLI, TUI, and prompt moved to the store, `migrate` shipped
- [ ] Docs updated and tests added
- [ ] All gates in `GATES.md` pass
