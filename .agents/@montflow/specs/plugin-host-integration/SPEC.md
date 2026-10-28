---
name: plugin-host-integration
status: complete
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-28
locked-phases: A, B, C, D
---

# plugin-host-integration

## Description

Montflow migrated to OpenCode v2 plugins, but the plugins do not load in the
host that is actually installed. `/mf-prompts list` never ran: the command was
not registered, and once wired in, the server entry threw on import because
`@montflow/opencode` builds `@opencode/schema` values that are pinned to
`effect@4.0.0-rc.112` while the host provides `effect@4.0.1`, which dropped
`Schema.isStartsWith`. A second loader restriction rejects the deep
`effect/dist/...` imports that `apps/doctor` pulls in.

A local stopgap works: `.opencode/plugins/prompts/` registers `/mf-prompts list`
against the adapter-free half of the package, and a TUI part exposes `/prompts`,
a select dialog that pastes the chosen template into the composer. That stopgap
is the shape every plugin should have, but it is prompts-only, lives outside the
packages, and duplicates store reads.

This spec turns the stopgap into the real thing. Phase A establishes exactly why
plugins fail to load and what the host TUI API does and does not allow. Phase B
decides the compatibility strategy and the shared picker contract. Phase C fixes
the loader path, adds the shared TUI picker to `@montflow/opencode`, wires it
into every plugin — prompts, skills, specs, profiles, reviews — retires the
remaining Pi-era naming, and verifies that every plugin loads through the real
host loader.

## Requirements

- The failure is recorded with evidence, not inference: the installed host
  version, the effect version it provides, the exact throw site in
  `@montflow/opencode`, and every loader restriction observed while wiring the
  prompts plugin.
- Phase B chooses one compatibility strategy for the effect/schema skew —
  aligning the repo to the host's dependency versions, isolating the adapter
  from `@opencode/schema` runtime values, or a documented compatibility layer —
  and states what breaks under each.
- Phase B defines one picker contract in `@montflow/opencode`: register a TUI
  command that opens a select dialog over a store, searchable, and that inserts
  a per-plugin result into the composer. Plugins differ only in how they read
  their store and what they insert.
- Server command output is never silent: a command that produces text posts it
  into the session, because the host offers no toast channel to a server plugin.
- Every montflow plugin (`prompts`, `skills`, `specs`, `profiles`, `reviews`)
  exposes a picker through that contract, and `/mf-prompts list` and friends work
  in a real OpenCode host session.
- The migration to OpenCode is complete in the names users type and read: no
  user-facing surface says Pi. There is exactly one prompts command,
  `/mf-prompts`; no arguments or `list` opens the picker, and every other verb
  keeps its headless behaviour. A second prompt command (`/prompts`,
  `/mf-prompts-tui`) is not acceptable. The prompts store, packaged skills, CLI
  help, refusals, toasts, and docs carry no `pi-` prefix; legacy store
  directories are migrated rather than broken.
- One command means one entry point in slash completion: the TUI picker
  intercepts `/mf-prompts` and forwards any non-`list` argument to the server
  command of the same name, so the two never diverge into separate verbs.
- Plugin loading is verified mechanically: a check loads each plugin package
  through the host's loader path and fails when an entry cannot be imported.
- The prompts stopgap is deleted, not left duplicated beside the packaged
  implementation.
- `bun run mf:gate` stays green, with the prompts package scoped verification
  green at every cut.
- The branch stays mergeable with `origin/main`: upstream's phase-directory spec
  layout is adopted without dropping any branch work.

Phase D reconciles the branch with `origin/main` after upstream moved every
spec task under a phase directory. It merges the upstream commit, resolves the
conflicts so both the Pi-naming retirement and the new layout survive, migrates
this spec's own task directories into the phase layout, and reviews the result
so the branch can be offered as a pull request.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | explore-host-integration | exploratory | complete | No |
| A099 | review-phase | review | complete | No |
| B001 | decide-integration-strategy | planning | complete | No |
| B099 | review-phase | review | complete | No |
| C001 | fix-plugin-host-loading | execution | complete | Yes |
| C002 | add-shared-tui-picker | execution | complete | Yes |
| C003 | wire-plugin-pickers | execution | complete | Yes |
| C004 | retire-pi-naming | execution | complete | Yes |
| C005 | verify-host-integration | execution | complete | Yes |
| C099 | review-phase | review | complete | No |
| D001 | merge-upstream | execution | complete | Yes |
| D002 | migrate-task-layout | execution | complete | Yes |
| D099 | review-phase | review | complete | No |
