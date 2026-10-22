---
name: montflow-opencode-migration
status: complete
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-13
locked-phases: A, B, C
---

# Montflow OpenCode migration

## Description

Montflow's `pi-*` packages are built on `@earendil-works/pi-coding-agent`: each
registers commands and tools against Pi's `ExtensionAPI`, drives agent sessions
through Pi's `ModelRuntime` / `createAgentSession`, and renders its interactive
flows with `@earendil-works/pi-tui`. OpenCode v2 replaced its plugin system with
a scoped, Effect-native API that owns sessions, tools, commands, agents, skills,
storage, and the terminal UI — the same concerns the `pi-*` packages implement
themselves, on the same Effect v4 and OpenTUI/Solid foundation the workspace
already uses.

This spec plans the migration of the montflow toolchain from Pi to OpenCode v2
plugins. It answers two questions: what actually maps, and how to get there in
ordered, reversible steps. Phase A inventories both surfaces — the Pi API each
package consumes, the OpenCode v2 plugin domains and TUI surfaces, the
session-engine gap (`pi-sessions` versus `ctx.session.*`), the workspace TUI
port, and packaging/verification. Phase B turns that inventory into decisions:
package architecture, adapter seams, the session model, the workspace
integration surface, the execution sequence, and how the result is verified and
distributed.

The working hypothesis is that `pi-sessions` is retired entirely in favor of
OpenCode's built-in session execution and subagent system, leaving no
montflow-owned session engine. Phase A validates that this is feasible and
surfaces any blocker; Phase B decides it.

Phases A and B are analysis only: they modify no file outside
`.agents/@montflow/specs/`. Phase B decides the target design; Phase C is the
execution that ports the toolchain onto it, authored from the B005 sequence.

## Requirements

- Phase A produces a complete capability matrix: for every `pi-*` package and every Pi primitive it uses, the OpenCode v2 domain or TUI surface that replaces it, or an explicit "no equivalent" with the gap named.
- The OpenCode inventory records the real v2 surface — `transform`/`hook`/`reload` registration, the tool/command/agent/skill/session/event/storage/rpc domains, the CLI plugin surfaces (slots, session panel, routes, dialogs, keymap), loading/config, and the Effect-versus-Promise authoring split — with the source path for each claim.
- The session gap is decided explicitly, with retiring `pi-sessions` in favor of OpenCode's built-in session and subagent system as the preferred outcome: Phase A validates that `ctx.session.*` plus subagent and background jobs cover dispatch, steer, interrupt, resume, answer, receipts, and the child-session tools, and names only what — if anything — must survive as a small projection rather than assuming the engine is retained.
- The workspace port names one target surface per panel and states where the configurable grid, the session transcript, and the receipt/lifecycle overlay live.
- Version and runtime compatibility is recorded: Effect major/minor, the OpenTUI `0.5`→`0.6` gap, the plugin runtime's `effect` redirection, peer-dependency rules, and the loader's Git-versus-npm distribution.
- Phase B chooses a package/extract architecture (plugin packages, entrypoints, `./` versus `./tui` exports, what remains a standalone CLI) and names every adapter port that isolates OpenCode.
- Phase B defines the migration sequence as ordered execution phases, cheapest-and-most-isolating first (pure-Effect domain packages before session- and TUI-dependent ones), with an explicit cut and rollback for each.
- Phase B specifies how the migrated packages are verified (turbo tasks, a plugin-loader smoke test, adapter contract tests) and distributed (peer deps, version pins, CI), without weakening the existing `verify:montflow` gate.
- Every claim that drives a Phase B decision is grounded in a file path, a type signature, or a runnable check recorded in a task's `MEMORY.md`.
- Phases A and B modify no file outside `.agents/@montflow/specs/`, and leave every `pi-*` package and the workspace application unchanged.
- Phase C executes the B005 sequence in order: the adapter and loader proof land first (`@montflow/opencode` + the `pi-specs` pilot), then the pure domain libraries and CLIs, then the child-run and dispatch concerns, then the TUI/workspace, then `pi-sessions` is retired, then verification and distribution finalize.
- Phase C isolates OpenCode behind the adapter: `@opencode/*` is imported only by `@montflow/opencode`; pure domain modules and every plugin reach the host only through the adapter ports.
- Phase C is additive until each step's delete: old `pi-*` packages stay installed and loadable until the phase that ports them, and every phase is independently revertible at its own cut.
- Phase C keeps `verify:montflow` green at every cut and removes `pi-sessions` only after C003–C005 are proven on native sessions.

## Tasks

| ID   | Name                               | Type        | Status  | Gates |
| ---- | ---------------------------------- | ----------- | ------- | ----- |
| A001 | explore-pi-extension-surface       | exploratory | complete | No    |
| A002 | explore-opencode-plugin-api        | exploratory | complete | No    |
| A003 | explore-session-engine-gap         | exploratory | complete | No    |
| A004 | explore-workspace-ui-port          | exploratory | complete | No    |
| A005 | explore-packaging-and-verification | exploratory | complete | No    |
| A006 | synthesize-migration-contract      | exploratory | complete | No    |
| A099 | review-phase                       | review      | complete | No    |
| B001 | decide-package-architecture        | planning    | complete | No    |
| B002 | decide-adapter-seams               | planning    | complete | No    |
| B003 | decide-session-engine-mapping      | planning    | complete | No    |
| B004 | decide-workspace-integration       | planning    | complete | No    |
| B005 | plan-migration-sequence            | planning    | complete | No    |
| B006 | plan-verification-and-distribution | planning    | complete | No    |
| B099 | review-phase                       | review      | complete | No    |
| C001 | adapter-spine-and-loader-proof     | execution   | complete | Yes   |
| C002 | extract-pure-domain-and-clis       | execution   | complete | Yes   |
| C003 | port-child-run-extensions          | execution   | complete | Yes   |
| C004 | port-dispatch-extensions           | execution   | complete | Yes   |
| C005 | port-tui-and-workspace             | execution   | complete | Yes   |
| C006 | retire-pi-sessions                 | execution   | complete | Yes   |
| C007 | verification-and-distribution      | execution   | complete | Yes   |
| C099 | review-phase                       | review      | complete | No    |
