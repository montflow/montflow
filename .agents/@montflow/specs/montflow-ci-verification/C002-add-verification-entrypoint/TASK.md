---
id: C002
name: add-verification-entrypoint
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C002: Add the shared verification entry point

## Type: execution

## Description

Add the root scripts that CI and the pre-push hook both call, per B001
decisions 3 and 7.

## Requirements

- `verify:montflow:extensions` — skills `verify` + `doctor --check`, prompts `verify --all`, specs `check`, profiles verify, runs `doctor`, each against this repo's artifacts with the correct `--dir`/cwd.
- `verify:montflow` — `lint:check`, `format:check`, `ts:check`, `test`, then `verify:montflow:extensions`.
- `verify:montflow:fast` — `lint:check`, `format:check`, `ts:check`, then `verify:montflow:extensions` (no test suite).
- Each check is its own attributable step; the aggregate exits non-zero on any failure.
- Call package `cli` scripts, never tool binaries directly.

## Completion

- [x] Three scripts exist and pass on a clean checkout
