---
id: C002
name: add-release-guard
type: execution
originator: user
depends-on: C001
related-tasks:
status: complete
---

# Task C002: add-release-guard

## Type: execution

## Description

Add a mechanical guard so release metadata cannot drift from the code: the five versions agree, each CLI reports its own `package.json` version, and the tag shape the update check reads is the one changesets writes.

## Requirements

- A `mf:check` scope fails when the five CLI package versions disagree.
- A test fails when a CLI's reported version differs from its `package.json` version — the same invariant, enforced at runtime rather than only in config.
- A test asserts the tag prefix the update check parses (`@montflow/<package>@<version>`) is the prefix changesets produces.
- The new scope runs inside `mf:check` and the CI `verify` matrix without adding a workflow or a matrix cell.
- Each of the five packages has a `CHANGELOG.md` stating the release-versus-checkout model.

## Completion

- [x] Done.
