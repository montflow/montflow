---
id: A003
name: add-exclusion-tests
type: execution
originator: user
size: medium
depends-on: A002
write-scope: packages/skills/src/apps/sync/tests/,packages/skills/src/apps/cli/tests/
related-tasks:
status: pending
---

# Task A003: add-exclusion-tests

## Type: execution

## Description

Add tests covering the exclusion behavior A001 and A002 land, at both the engine
and the CLI boundary. The suite proves the three acceptance cases from the
issue: an excluded skill (reported `skipped` / `excluded`, local copy preserved,
clean check), an unknown name in `exclude` (warning, run succeeds), and a missing
config file (no behavior change).

## Requirements

- Tests cover a skill excluded by name: `sync` reports it `skipped` / `excluded`, never writes it to the target, and a check run is clean (current, exit 0) when only excluded skills are non-current.
- Tests cover a skill excluded by name that already has a local copy in the target `.agents/skills/`: the local copy is left byte-identical.
- Tests cover an unknown name in `exclude`: the run warns, does not fail, and skips nothing extra.
- Tests cover a missing config file: behavior is unchanged (the full public set is enforced as before).
- The existing `internal` (frontmatter) skip tests still pass unchanged.
- Tests live beside the existing sync tests (`packages/skills/src/apps/sync/tests/` and `packages/skills/src/apps/cli/tests/`), follow their fixture patterns (throwaway checkout + workspace sandbox), and pass via the package test script.

## Completion

- [ ] Excluded-skill engine and CLI tests pass (skipped/excluded, local copy preserved, clean check).
- [ ] Unknown-name-in-`exclude` test passes (warning, run succeeds).
- [ ] Missing-config test passes (no behavior change).
- [ ] The full sync test suite still passes.

## Execution

Read the phase `MEMORY.md` `## Execution Brief` and this task's `GATES.md`; work
only within `packages/skills/src/apps/sync/tests/` and
`packages/skills/src/apps/cli/tests/`.