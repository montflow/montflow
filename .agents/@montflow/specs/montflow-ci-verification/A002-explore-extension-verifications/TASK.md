---
id: A002
name: explore-extension-verifications
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A002: Enumerate the extension verifications

## Type: exploratory

## Description

Enumerate the verification surfaces the extension packages expose, how each
invocation behaves headlessly, and its baseline result against this
workspace.

## Requirements

- Enumerate each verification command: `mf-skills verify`, `mf-prompts verify`, `mf-specs check`, `mf-profiles verify`, `mf-runs verify`, and each `doctor --check` (skills, prompts, specs, runs).
- For each: the exact invocation, required arguments and defaults, exit-code semantics, and whether it runs as a plain process or needs a Pi session over RPC.
- Run each against this workspace and record the baseline pass/fail and output.
- Determine what "verify all prompts" and "verify all profiles" require, given the per-name commands and their `list --status invalid` companion.
- Note every check that cannot run headless today, and what would make it runnable.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Per-command table (invocation, headless?, baseline) captured in MEMORY.md
