---
id: A001
name: explore-host-integration
type: exploratory
originator: user
depends-on:
related-tasks:
status: pending
---

# Task A001: explore-host-integration

## Type: exploratory

## Description

Establish, with evidence, why the montflow plugins fail to load in the installed
OpenCode host and what the host's TUI plugin API allows. This is the inventory
Phase B decides from; it changes no file outside `.agents/@montflow/specs/`.

The prompts work already exposed three distinct failures: the plugin was never
registered at all, the server entry threw on `Schema.isStartsWith`, and the
loader rejected a deep `effect/dist/...` import reached through `apps/doctor`.
Only the first was a wiring mistake; the other two are host-compatibility facts
that decide the strategy for every plugin.

## Requirements

- Record the installed host version and the `effect`/`@opencode/plugin` versions
  it provides, with the command or log line that proves each.
- Record the version this repo pins and the first throw site when
  `@montflow/opencode` is imported under the host runtime, quoting the error.
- Enumerate the loader restrictions observed while wiring prompts: which
  specifiers are provided, which package files are rejected, and which imports
  in this repo's plugin graph reach them.
- Inventory the TUI plugin surface from the host source: commands, `ui.dialog`
  (select, prompt, alert, confirm), slots, routes, keymap registration, and the
  storage model, with source paths.
- Determine whether the composer can be written through a supported API. Record
  the answer and, if it is unsupported, the exact fallback in use
  (`renderer.currentFocusedEditor.insertText`) and its failure modes.
- Inventory each plugin's store and natural picker result: prompts (template),
  skills (skill name), specs (spec name plus action), profiles (profile name),
  reviews (series plus round).
- List every place the current prompts stopgap duplicates package logic, so
  Phase C can delete it rather than keep both.
- Inventory the Pi-era naming still reachable by a user: the store path, packaged
  skill names, command names, CLI help and refusals, toasts, and docs. The
  picker telling a user about `pi-prompts` is the observed symptom; Phase C needs
  the complete list to retire it.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Evidence recorded in `MEMORY.md` with a source path, version, or log line per claim.
- [ ] Per-plugin picker inventory complete.
- [ ] Composer-insertion answer recorded with its fallback.
