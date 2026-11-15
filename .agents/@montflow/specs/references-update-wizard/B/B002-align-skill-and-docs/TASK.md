---
id: B002
name: align-skill-and-docs
type: execution
originator: user
size: small
depends-on:
write-scope: packages/references/skills/montflow-add-reference/,packages/references/README.md,packages/references/src/apps/cli/CONTEXT.md,packages/references/src/apps/cli/binary.apps.module.ts,packages/references/src/apps/cli/slash.apps.module.ts,packages/references/CHANGELOG.md
related-tasks: B001
status: pending
---

# Task B002: align-skill-and-docs

## Type: execution

## Description

Bring the `montflow-add-reference` skill and the CLI documentation into line
with the new update surface and the tracking-vs-pinned distinction. The skill's
CLI reference section and the `update` rows in the CLI usage text must teach the
new `--ref <commit|tag|branch>`, `--latest`, and `--wizard` flags and the
`tracking <branch>` vs `pinned to <sha7>` vocabulary. The skill should show the
difference between pinning an entry and following latest on the tracked branch,
and teach that the `REFERENCE.md` change is left uncommitted for review.

## Requirements

- The `montflow-add-reference` skill's CLI reference section lists the new `update` flags: `--ref <commit|tag|branch>`, `--latest`, and `--wizard`.
- The skill explains the difference between pinning to a commit and following latest on the tracked branch, and that `update --ref`/`--latest`/`--wizard` writes the `REFERENCE.md` change and leaves it uncommitted.
- The skill teaches the `tracking <branch>` vs `pinned to <sha7>` vocabulary so a reader knows how to tell a pin from a tracking relationship.
- The CLI usage/help text (binary `USAGE`, slash `USAGE`/`COMMAND_DESCRIPTION`, and the `update` command description) reflects the new flags.
- `CONTEXT.md` (the CLI command-surface doc) notes the new `update` flags.
- The package changelog carries entries for the new flags, wizard, and ref-kind surfacing.
- The shipped skill stays internally consistent: its examples and prose use the new flag forms and vocabulary.

## Completion

- [ ] The `montflow-add-reference` skill teaches `--ref`/`--latest`/`--wizard` and the tracking-vs-pinned vocabulary.
- [ ] The CLI usage/help text and `CONTEXT.md` reflect the new flags.
- [ ] The package changelog carries the new feature entries.
- [ ] The skill's examples use the new flag forms and vocabulary.