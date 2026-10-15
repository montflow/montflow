---
id: C005
name: migrate-series-and-docs
type: execution
originator: user
depends-on: B003, C001, C002, C003, C004
related-tasks:
status: complete
---

# Task C005: Migrate specs and document the change

## Type: execution

## Description

Apply the chosen profiles to existing specs and series, seed the new series,
and land the documentation and changelog entries that close the spec.

## Requirements

- Apply the decided profile lists to the chosen existing specs' review tasks and seed any new series with the expected rounds and `Profile:` metadata.
- Keep every spec and series verifying: `verify:montflow:specs` and `verify:montflow:reviews` pass.
- Add documentation for the `profiles` field, the per-profile series, and the effect-reviewer binding for code phases.
- Add changelog entries for every changed package.
- Confirm the spec's own `mf-specs check` reports zero issues and record the final state.

## Completion

- [x] Chosen specs migrated and all series seeded
- [x] Docs and changelogs landed
- [x] `verify:montflow:specs` and `verify:montflow:reviews` pass
- [x] GATES.md passed
