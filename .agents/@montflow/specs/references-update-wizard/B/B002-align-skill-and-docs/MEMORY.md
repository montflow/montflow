# Memory

## Context

B002 aligns the `montflow-add-reference` skill and CLI documentation with the
new `--ref`/`--latest`/`--wizard` update surface and the tracking-vs-pinned
vocabulary.

## Progress

- Skill `SKILL.md`: the Reference `update` bullet lists the three target flags;
  a new paragraph teaches pinned (`pinned to <sha>`) vs tracking
  (`tracking <branch>`), that `update --ref`/`--latest`/`--wizard` writes the
  `REFERENCE.md` change and leaves it uncommitted.
- Created `packages/references/src/apps/cli/CONTEXT.md` (the CLI command-surface
  doc) noting the `update` flags and the tracking/pinned rendering.
- `CHANGELOG.md` Unreleased/Added: entries for the target flags + wizard, and
  for the status/verify tracking-vs-pinned surfacing.
- `README.md`: updated the `update` usage line to list the three flags.
- Regenerated the embedded skill payload (`generate:payload`) and ran
  `mf-references doctor` to reinstall the shipped skill (was stale).

## Findings

- B002 gate (doctor suite) passes; `mf-references:check` passes after repair.
- The binary/slash usage and help text were already updated during A002.

## Gates

- B002 GATES Stage 0 runs the doctor suite; passes (74 tests).

## Open Questions

- None.

## Handoff

- B003 reviews phase B.

## Deviations

- None.