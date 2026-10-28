---
id: A002
name: explore-opencode-plugin-api
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A002: Inventory the OpenCode v2 plugin surface

## Type: exploratory

## Description

Inventory OpenCode v2's plugin authoring and extensibility surface from the
pinned reference clone and the bundled docs. This is the target side of the
migration matrix and the source of truth for what a port can rely on.

## Requirements

- Record the authoring contract (`Plugin.define({ id, setup | effect })`) and registration semantics (`transform`/`hook`/`reload`, scope-owned disposal, ordering, boot batching) with source paths.
- Enumerate the server domains and the operation each exposes plus its hook names: agent, tool, command, skill, session, model, provider, mcp, integration/credential, permission, shell, event, storage, rpc, generate, reference, vcs, websearch, worktree.
- Enumerate the TUI plugin surfaces: slots, `session.panel`, routes/pages, dialogs (`select` with `search`, `confirm`, `prompt`, `show(JSX)`), toasts, attention, keymap (palette/slash/binds), tabs, model, storage, and markdown renderers.
- Record the loader/config model: `.opencode/plugin|plugins` scanning, `opencode.jsonc` `plugins`, `cli.json`, package entrypoints (`./`, `./tui`, `./rpc`), and Git-versus-npm resolution.
- Record the runtime/version facts: `effect` redirection to the host copy, OpenTUI/Solid peer versions, and the Effect and OpenTUI pins.
- Note maturity signals: the Effect `PLAN.md` deferred decisions, experimental hooks, and any surface explicitly marked unstable.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Domain and hook inventory captured in MEMORY.md with source paths
- [ ] TUI surface and loader/config inventory captured
- [ ] Version and maturity facts recorded
