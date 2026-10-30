---
id: C007
name: align-docs-and-artifact-ledger
type: execution
originator: planner:B003
size: small
depends-on: C006
related-tasks:
status: pending
---

# Task C007: align docs and artifact ledger

## Type: execution

## Description

Update every document that describes the old flat-phase contract, so the store own docs
stop contradicting the store.

## Requirements

- `AGENTS.md`, the skills and profiles package READMEs, the wiki pages describing specs and phases, and the bookkeeper artifact ledger table are updated to the v2 layout, the new verbs, and the manifest.
- The ledger gains rows for profiles and prompts as payload kinds and a line for the report-only versus repair verb split.
- `CHANGELOG.md` entries per changed package follow Keep a Changelog and SemVer, with breaking changes marked.
- The two existing v1 specs are recorded as frozen, with the rule for reading them stated in docs rather than left implicit.

## Completion

- [ ] No document still describes a phase as a task-id prefix or a hand-written lock list
- [ ] The skills, profiles, and prompts verifiers all pass against the updated artifacts
- [ ] Changelog entries exist for every package whose behavior changed
- [ ] `bun run verify:montflow` passes end to end
