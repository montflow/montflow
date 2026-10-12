---
id: A002
name: explore-payload-doctor-surface
type: exploratory
originator: user
depends-on:
related-tasks:
status: pending
---

# Task A002: explore payload doctor surface

## Type: exploratory

## Description

Map exactly what each extension package ships and what each `doctor` does with it, so
the payload-manifest decision in B003 rests on real state rather than documented
intent. Read-only.

## Requirements

- For each of `pi-skills`, `pi-prompts`, `pi-specs`, `pi-runs`, `pi-profiles`: which payload directories exist in the package, which artifact kinds they hold, and which name list the doctor reads.
- For each doctor: does it compare contents or only presence, does it report or write, and does it work in a compiled binary.
- Confirm from `package.json` scripts that `verify:montflow:runs` invokes `doctor` with no report-only mode while the skills and prompts scripts pass the check flag, and state plainly what a CI run writes into `.agents/`.
- Confirm whether `pi-specs` and `pi-runs` can find their payload at all once built with `--compile`, given neither generates an embedded copy, and name the error a user would see.
- Record that the embedded-payload generator exists twice, in `pi-skills/scripts` and `pi-prompts/scripts`, and what a third copy would cost.

## Completion

- [ ] Per-package table recorded in MEMORY.md: payload dir, artifact kinds, compare mode, write mode, compiled-binary status
- [ ] The CI-writes-during-verify defect confirmed with the exact command and observed effect
- [ ] The compiled-binary payload gap confirmed or disproved by experiment, not assumed
- [ ] No file outside `.agents/@montflow/specs/` was modified
