---
id: A003
name: summary-tests
type: execution
originator: user
size: small
depends-on: 
write-scope: packages/skills/src/apps/cli/tests/sync.test.ts,packages/skills/src/apps/sync/tests/sync.test.ts
related-tasks: A001, A002
status: complete
---

# Task A003: summary-tests

## Type: execution

## Description

The sync report-byte tests live at the CLI boundary
(`packages/skills/src/apps/cli/tests/sync.test.ts`) for the rendered report and at
the engine boundary (`packages/skills/src/apps/sync/tests/sync.test.ts`) for the
classifications behind it. This task ensures the tests assert the A001 summary and
the A002 exit behaviour exactly — the grouped per-outcome report, the count footer,
`--verbose` per-file detail, and the `--check` verdict/refusal across both front
ends. The engine and the renderer are unchanged; the tests are the proof.

## Requirements

- Renderer tests assert the exact bytes of `Renderers.sync` for every outcome group
  (`Created`/`Updated`/`Unchanged`/`Skipped`), the count footer, and both `--verbose`
  modes.
- Engine tests assert per-skill `outcome`, `changed`, and `drifted` for added,
  updated, unchanged, and skipped skills, including internal-only stores.
- End-to-end tests cover the binary `mf-skills sync` and the `/mf-skills sync` slash
  form: write prints the summary, `--check` drift exits non-zero with the refusal
  line, current `--check` exits zero with `✓ current.`.
- Tests stay scoped to the sync area; package tests, lint, format, and typecheck
  remain green.

## Completion

- [x] Renderer report-byte tests cover all four outcome groups, the footer, and `--verbose`.
- [x] Engine tests cover the outcome classification and drift.
- [x] Binary and slash end-to-end tests cover write, drift, and current runs.
- [x] The summary-tests verification gate passes (see GATES.md).
