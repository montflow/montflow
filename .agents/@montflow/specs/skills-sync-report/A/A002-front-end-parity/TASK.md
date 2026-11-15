---
id: A002
name: front-end-parity
type: execution
originator: user
size: small
depends-on: 
write-scope: packages/skills/src/apps/cli/binary.apps.module.ts,packages/skills/src/apps/cli/slash.apps.module.ts
related-tasks: A001, A003
status: complete
---

# Task A002: front-end-parity

## Type: execution

## Description

Both front ends — the `mf-skills sync` binary command and the `/mf-skills sync`
slash command — render the sync report through `Renderers.sync(result, { verbose })`
and call the same `Sync.runSync` engine. This task confirms each handler prints the
concise summary from A001, that a `--check` drift run sets a non-zero exit, and that
the refusal line names the caller's own typeable invocation (`mf-skills sync` for the
binary, `/mf-skills sync` for the slash). The engine is not changed.

## Requirements

- The binary `sync` handler renders `Renderers.sync` with the caller's `--verbose`,
  turns `--check` drift into a non-zero exit (`exitFailed`), and prints
  `Renderers.syncRefusal` on drift.
- The slash `sync` action does the same through `ui.notify`, with invocation
  `/mf-skills sync`, and a `--check` drift run fails with the refusal line.
- A write run returns exit `0` and prints the summary; a `--check` drift run returns
  non-zero; a current `--check` run returns `0` and prints `✓ current.`.
- Refusals and refusals-on-error name the caller's own typeable form, never the
  other front end's.

## Completion

- [x] Binary and slash handlers both print the A001 summary.
- [x] `--check` drift sets a non-zero exit; write and current `--check` stay zero.
- [x] The refusal line names the caller's own invocation in each front end.
- [x] The front-end parity verification gate passes (see GATES.md).
