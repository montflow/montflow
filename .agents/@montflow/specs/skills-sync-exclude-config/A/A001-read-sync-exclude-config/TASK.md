---
id: A001
name: read-sync-exclude-config
type: execution
originator: user
size: medium
depends-on:
write-scope: packages/skills/src/apps/sync/
related-tasks:
status: pending
---

# Task A001: read-sync-exclude-config

## Type: execution

## Description

Read the optional `.agents/@montflow/skills/config.json` from the **target
workspace** root and parse its `exclude` list of skill names. This is the
input every other task in the phase consumes. A missing config file means no
behavior change (the empty exclusion set); an unknown name in `exclude` — one
that names no public skill in the source checkout — is a warning, never an
error, because skills get renamed upstream.

## Requirements

- A parser in the `sync` engine reads `.agents/@montflow/skills/config.json` from the target workspace root (the `--target`/`--dir` value), never from the montflow source checkout.
- The config is JSON `{ "exclude": ["name", ...] }`. A missing file, or one whose `exclude` is absent or empty, yields the empty exclusion set and changes no behavior.
- A name in `exclude` that matches no public skill in the source checkout is surfaced as a warning, never an error, and the run proceeds.
- The exclusion set is threaded into the sync engine's data flow so the next task (A002) can consume it without re-reading the file or re-resolving the workspace root.
- The parse is pure (structured data out, displayable-string failure out) with no argv or console knowledge, matching the engine contract.

## Completion

- [ ] The exclusion set is parsed from the target workspace config file.
- [ ] A missing config file yields the empty exclusion set with no behavior change.
- [ ] An unknown `exclude` name is a warning, not an error.
- [ ] The set is available to the sync engine's subsequent steps.

## Execution

Read the phase `MEMORY.md` `## Execution Brief` and this task's `GATES.md`; work
only within `packages/skills/src/apps/sync/`.