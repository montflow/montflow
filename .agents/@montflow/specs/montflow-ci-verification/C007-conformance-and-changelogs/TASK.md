---
id: C007
name: conformance-and-changelogs
type: execution
originator: planner:B002
depends-on: C006
related-tasks:
status: complete
---

# Task C007: Conformance sweep and changelogs

## Type: execution

## Description

Run the whole gate locally, fix every failure, and record the release.

## Requirements

- Run `bun run verify:montflow` and `bun run hooks:install`; fix every failure.
- Confirm `bun run --cwd packages/pi-specs cli check --dir $PWD/.agents/@montflow/specs` reports no issues.
- Confirm the workflow triggers, matrix cells, and job names match the docs.
- Add changelog entries for every user-visible change (`pi-prompts`/`pi-profiles` verifies, root scripts, hook, workflow).
- Confirm no file outside the intended scope was modified.

## Completion

- [x] Full local gate green
- [x] Changelogs and docs updated
