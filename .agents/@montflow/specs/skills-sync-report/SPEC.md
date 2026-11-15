---
name: skills-sync-report
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-11-15
spec-version: 2
---

# skills-sync-report

## Description

`mf-skills sync` copies a checkout's public skills into a workspace `.agents/skills`
store. Its engine (`packages/skills/src/apps/sync/`) already classifies every skill
as `added`, `updated`, `unchanged`, or `skipped` and returns `changed` and
`drifted`, but the write-mode report was not surfacing which skills changed. This
spec makes the write-mode `mf-skills sync` report a concise per-outcome summary of
added, updated, unchanged, and skipped skills, matching the `--check` report
style. Rendering stays with the renderer token contract: lean by default, `--verbose`
only adds per-file detail, and failures are never suppressed.

## Requirements

- Write-mode `mf-skills sync` prints a concise summary that shows which skills
  were added, updated, unchanged, and skipped, in the same grouped style as
  `--check`.
- The summary is lean by default: one line per skill name under each present
  outcome group (`Created`/`Updated`/`Unchanged`/`Skipped`), plus a count footer
  (for example `3 created · 2 updated · 41 unchanged · 1 skipped`).
- `--verbose` only adds per-file detail under the skill it came from; it never
  changes the lean lines, and passing or failing skills are never dropped.
- The binary `mf-skills sync` and the `/mf-skills sync` slash command render the
  same bytes through `Renderers.sync(result, { verbose })`; no domain rule lives
  in either front end.
- The summary derives from the engine's per-skill `outcome` plus `changed` and
  `drifted`; the engine itself does not change.
- `--check` keeps its drift/current verdict line and non-zero exit on drift, and
  a write run prints the same grouped summary without the verdict line.
- Engine, renderer, and end-to-end tests assert the exact report bytes for every
  outcome and for both `--verbose` modes, and keep package tests, lint, format,
  typecheck, and `mf:check:skills` green.

## Creation

- rigor: light
- questions 0/1
- unresolved: none

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | report-sync-summary | execution | pending | Yes |
| A002 | front-end-parity | execution | pending | Yes |
| A003 | summary-tests | execution | pending | Yes |
