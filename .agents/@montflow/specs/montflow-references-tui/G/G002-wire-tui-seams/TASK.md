---
id: G002
name: wire-tui-seams
type: execution
originator: user
depends-on: G001
related-tasks: G099
status: pending
size: medium
---

# Task G002: Wire the TUI seams and document the panel

## Type: execution

## Description

A panel is only useful if the data seam behind it is honest and the surface is
discoverable. Export the read-only reference summaries the panel consumes,
document the panel in the workspace README and the references README, and make
the slash surface consistent with the CLI.

## Requirements

- Export a read-only summary seam from `@montflow/references` (entry slug, purpose, ref, clone path, state) that the TUI can consume without spawning git or touching the network.
- Keep the seam pure/typed and covered by tests; the plugin loader smoke must still see the package.
- Make `/references` (or the extended `/workspace` command) consistent between the binary, the slash command, and the TUI keybind; no second spelling of the verb.
- Document the panel in `apps/workspace/README.md` and the references package README: what each state means and that the TUI never fetches.
- Note the panel in the changeset and in the references skill? No — skills stay CLI-first; the TUI is a host surface.
- Run the TUI suite, the workspace typecheck/lint/format, and the references suite.

## Completion

- [ ] read-only summary seam exported and tested
- [ ] panel documented with the state vocabulary
- [ ] slash command and keybind agree with the CLI surface
- [ ] TUI, workspace, and references checks pass
