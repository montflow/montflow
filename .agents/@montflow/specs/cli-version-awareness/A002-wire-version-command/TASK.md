---
id: A002
name: wire-version-command
type: execution
originator: user
depends-on: A001
related-tasks:
status: pending
---

# Task A002: wire-version-command

## Type: execution

## Description

Every `mf-*` CLI reports its own package version from `--version` and gains a `version` subcommand that prints the identity in human and JSON form, so an agent reads one place instead of guessing.

## Requirements

- The five hardcoded `export const VERSION = '0.0.1'` constants are gone; each CLI derives its version from its own `package.json` through one shared mechanism.
- `mf-<cli> version` prints name, version, commit, dirty state, checkout path, and the installed store version when a store is present.
- `mf-<cli> version --json` prints only the JSON identity on stdout; diagnostics go to stderr.
- `--version` keeps working and reports the same value as `version`.
- A test fails if any CLI's reported version differs from its `package.json` version.
- The slash-command surfaces (`/mf-skills version` and peers) are out of scope for this task; the binary is the deliverable.

## Completion

- [ ] Done.
