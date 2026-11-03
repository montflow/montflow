---
id: C007
name: align-docs-and-artifact-ledger
type: execution
originator: planner:B005
size: small
depends-on: C006, C008
related-tasks:
status: pending
---

# Task C007: align docs and artifact ledger

## Type: execution

## Description

Update every document that describes the old flat-phase contract, so the store's
own docs stop contradicting the store and the CLI/TUI surfaces it now ships.

## Requirements

- `AGENTS.md`, the skills, profiles, and specs package READMEs, the wiki pages describing specs and phases, and the bookkeeper artifact ledger table are updated to the v2 layout, the new verbs, the CLI/TUI surfaces, and the manifest.
- The ledger gains rows for profiles and prompts as payload kinds and a line for the report-only versus repair verb split.
- `CHANGELOG.md` entries per changed package follow Keep a Changelog and SemVer, with breaking changes marked.
- Every spec B001 migrated is recorded as frozen or upgraded, with the rule for reading a v1 tree stated in docs rather than left implicit.
- The docs stop describing `mf-specs` as having no lock verb or gate runner where the v2 verbs now exist.

## Completion

- [ ] No document still describes a phase as a task-id prefix or a hand-written lock list
- [ ] The skills, profiles, and prompts verifiers all pass against the updated artifacts
- [ ] Changelog entries exist for every package whose behavior changed
- [ ] `bun run mf:check` passes end to end
