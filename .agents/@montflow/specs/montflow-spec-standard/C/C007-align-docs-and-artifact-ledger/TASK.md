---
id: C007
name: align-docs-and-artifact-ledger
type: execution
originator: planner:B005
size: small
depends-on: C006, C008, C009
related-tasks:
status: complete
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
- Every spec B001 migrated is recorded as frozen or upgraded, from C005's live-store `migrate --all` output, with the rule for reading a v1 tree stated in docs rather than left implicit.
- The docs stop describing `mf-specs` as having no lock verb or gate runner where the v2 verbs now exist.

## Completion

- [x] No document still describes a phase as a task-id prefix or a hand-written lock list
- [x] Every spec under `.agents/@montflow/specs` reads `spec-version: 2` (or is listed as frozen with its reason) after C005's `migrate --all` run, and the ledger records the run's per-spec result
- [x] The skills, profiles, and prompts verifiers all pass against the updated artifacts
- [x] Changelog entries exist for every package whose behavior changed
- [x] `bun run mf:check` passes end to end
