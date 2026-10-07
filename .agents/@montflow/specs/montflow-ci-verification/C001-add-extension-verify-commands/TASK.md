---
id: C001
name: add-extension-verify-commands
type: execution
originator: planner:B002
depends-on: B099
related-tasks:
status: complete
---

# Task C001: Add extension verify commands

## Type: execution

## Description

Ensure every artifact-owning extension exposes a verify the gate can run
headlessly, per B001 decisions 8–9. This closes the A099 F1 prompts flaw and
the profiles RPC-only gap before the entry point depends on them.

## Requirements

- `mf-prompts`: add `verify --all` that enumerates raw `*.json` files and fails when any file is missing, unparseable, or invalid; it must not rely on `list`, which silently drops undecodable files and always exits 0.
- `mf-profiles`: add a headless verify (a CLI entry or `verify-all` action runnable without a Pi session) that fails non-zero on an invalid profile.
- Confirm the existing verifies run against the repo root: `mf-skills verify --dir <root>`, `mf-specs check --dir <specs>`, `mf-runs doctor`.
- Add tests for the new commands, including a store containing an unparseable file.
- Keep the house exit convention: print the report, set `process.exitCode`, never call `process.exit`.

## Completion

- [x] Every artifact-owning extension has a gate-runnable verify
- [x] Tests cover the new `verify --all` and profiles verify
