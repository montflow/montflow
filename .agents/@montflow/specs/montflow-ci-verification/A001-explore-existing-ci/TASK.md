---
id: A001
name: explore-existing-ci
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Inventory where checks run today

## Type: exploratory

## Description

Inventory the current verification surface: every workflow, every root and
package script, the turbo tasks behind them, and which pushes they actually
cover.

## Requirements

- Enumerate every workflow under `.github/workflows/` with its triggers, jobs, permissions, and the checks it performs.
- Catalogue the root and per-package `package.json` scripts and the turbo tasks (`test`, `ts:check`, `lint:check`, `format:check`) they map to.
- Determine which pushes currently receive checks and which receive none, given the release-package filter in `release.yml`.
- Record the exact command a contributor runs locally for each check.
- Produce a coverage matrix: check × trigger (push to main, pull request, release), marking where coverage is absent.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [x] Coverage matrix and current-state inventory captured in MEMORY.md
