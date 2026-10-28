---
id: G001
name: add-references-panel
type: execution
originator: user
depends-on: F099
related-tasks: G002
status: pending
---

# Task G001: Add the references panel to the workspace TUI

## Type: execution

## Description

The workspace grid already has skill, prompt, profile, and spec panels; the
reference store has no face in the TUI. Add a references panel that lists every
registered entry with its sync state, the way the prompts panel lists prompts,
so `/workspace` answers "what is registered, what is cloned, what moved" without
leaving the TUI.

## Requirements

- Add a `references` panel to the workspace grid, discovered the same way the prompts panel is (a contribution + panel component + service seam), not a bespoke screen.
- The panel lists one row per store entry: slug, purpose, and state — `synced` (clean clone at the recorded ref), `missing` (no clone), `dirty`, `foreign`, `ref-mismatch`, or `invalid` (unusable `REFERENCE.md`).
- Show the recorded pin (`ref`) when present and the derived clone path; never claim git state that was not read.
- Read state through `@montflow/references` (`list` plus the read-only `status` data) without network access; `--fetch` behaviour stays a CLI concern, never fired implicitly by the TUI.
- Degrade like the prompts panel: missing store notes how to install (`mf-references doctor`), empty store says so, loading and error states never shift the grid.
- Reuse the shared row windowing, search, and keybind conventions; selecting a row reveals its path and origin.
- Add a `/references` slash command (or extend `/workspace`) that focuses the panel, and a keybind consistent with the other panels.
- Cover the service seam and the panel with `.test.tsx` tests in `apps/workspace`, and keep the existing TUI suite green.
- No file outside `apps/workspace/` and `packages/references/` (only if a read-only seam must be exported) is modified.

## Completion

- [ ] References panel renders every entry with its state, purpose, and pin
- [ ] `/references` (or `/workspace`) reaches it; search and selection follow the existing conventions
- [ ] Panel and service seam covered by tests; TUI suite green
