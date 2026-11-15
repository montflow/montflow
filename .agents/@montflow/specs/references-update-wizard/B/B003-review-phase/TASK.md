---
id: B003
name: review-phase
type: review
originator: user
size: medium
depends-on: B001, B002
write-scope: none
related-tasks:
reviewer-profiles:
status: pending
---

# Task B003: review-phase

## Type: review

## Description

Review phase B: the tracking-vs-pinned surfacing (B001) and the skill/doc
alignment (B002). Confirm `status`/`verify` and their renderers distinguish a
branch-tracking `ref:` from a commit/tag pin, and that the `montflow-add-reference`
skill and CLI docs teach the new `--ref`/`--latest`/`--wizard` surface and the
`tracking <branch>` vs `pinned to <sha7>` vocabulary.

## Requirements

- The review round covers B001 and B002.
- Every open finding is batched into one fixer attempt and one re-review after `mf-specs review decide`.
- The review confirms the surfacing is consistent across `status`, `verify`, and the renderers, and that the skill/doc changes stay internally consistent with the CLI surface.

## Completion

- [ ] A review round for phase B is recorded and every finding resolved.
- [ ] The phase review decision is recorded in the phase channels.