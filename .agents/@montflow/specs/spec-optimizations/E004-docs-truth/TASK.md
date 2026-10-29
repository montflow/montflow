---
id: E004
name: docs-truth
type: execution
originator: user
size: tiny
depends-on: E001, E003
related-tasks:
status: complete
---

# Task E004: docs-truth

## Type: execution

## Description

The README sizing transcript runs a bare `mf-specs models`, which fails `models.unavailable` outside the host, while its own step 3 says to pass `--catalog`. The same section claims `sizing --task` prints the budget, which only the detailed output does.

Make the docs match the binary.

## Requirements

- Update the README sizing transcript so every catalogue command works outside the host: use the `spec_models` action or `mf-specs models --catalog <path>`; step 3, the transcript, and the verification loop agree.
- Replace the claim that `sizing --task` prints the task budget with the compact-versus-`--human` distinction.
- Sweep `packages/specs/README.md`, `packages/specs/src/apps/cli/CONTEXT.md`, `packages/specs/src/modules/prompt/CONTEXT.md`, root `AGENTS.md`, and the authoring skill for the same two claims.
- Change no behavior and no prompt text; `mf:check` and package checks pass.

## Completion

- [ ] The README transcript uses a catalogue command that works outside the host
- [ ] The budget sentence distinguishes compact and `--human` output
- [ ] Every swept doc matches the binary
- [ ] `mf:check` and package checks pass
