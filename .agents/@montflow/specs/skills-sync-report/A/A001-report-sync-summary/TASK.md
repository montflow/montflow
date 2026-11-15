---
id: A001
name: report-sync-summary
type: execution
originator: user
size: medium
depends-on: 
write-scope: packages/skills/src/apps/cli/renderers.apps.module.ts
related-tasks: A002, A003
status: complete
---

# Task A001: report-sync-summary

## Type: execution

## Description

`Renderers.sync(result, { verbose })` turns a `Sync.SyncResult` into the text both
front ends print. It must report a concise per-outcome summary of added, updated,
unchanged, and skipped skills, matching the `--check` style, so a write-mode
`mf-skills sync` shows which skills it changed. Rendering stays with the token
contract: lean by default, `--verbose` only adds per-file detail, failures never
suppressed. The engine's per-skill `outcome`, `changed`, and `drifted` are the
inputs; this renderer already groups outcomes and prints a count footer — confirm
and keep that shape, closing any gap that hides an outcome from a write run.

## Requirements

- A write run prints a header naming both roots (`Synced <source> → <target>`), one
  group per present outcome with its count (`Created`/`Updated`/`Unchanged`/
  `Skipped`) and one lean line per skill name, and a count footer (`N created · M
  updated · …`).
- The `--check` run prints the same grouped summary and adds its verdict line
  (`✗ drift — … would change` or `✓ current`); a write run prints the summary
  without the verdict line.
- `--verbose` adds per-file lines under the skill they came from and never changes
  the lean lines; `skipped` skills carry their reason (for example `internal`).
- Failures are never suppressed: any refusal or error text still reaches the
  output alongside the summary, and a store with no skills prints a non-empty
  placeholder.
- The engine does not change: the renderer reads only `outcome`, `changed`, and
  `drifted` from `Sync.SyncResult`.

## Completion

- [x] `Renderers.sync` prints the grouped summary and count footer for a write run.
- [x] `--verbose` adds per-file detail only, and skipped skills show their reason.
- [x] A write run prints the summary without the `--check` verdict line.
- [x] The renderer's own verification gate passes (see GATES.md).
