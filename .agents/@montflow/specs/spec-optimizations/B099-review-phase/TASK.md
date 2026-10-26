---
id: B099
name: review-phase
type: review
originator: user
size: small
depends-on: B004
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task B099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase B: the prompt store move, the
prompt sync, the packaged skill renames, and the live-reference sweep.

## Requirements

- Verify no live artifact still names `pi-prompts`, `pi-specs`, `pi-skills`, or
  `pi-profiles`; historical changelogs and completed spec records are the only
  allowed exceptions, and each must be justified.
- Verify the prompt store really moved: no empty old directory, no code path
  still reading the old segment, and the workspace service and CLI agree.
- Attack the skill rename: frontmatter `name` matches the directory, cross
  references resolve, old directories are gone, mirrors are byte-identical, and
  every embedded payload was regenerated.
- Verify doctor owns only the two spec prompts, repairs stale copies, never
  touches `commit.json` / `effect-review.json`, and that a stale prompt fails
  `mf:check:specs`.
- Verify `packages/profiles` module and namespace renames are complete and that
  no test still asserts an old name.
- Confirm no version bump, changelog entry, or historical record was rewritten
  to hide the rename.
- Write findings as the phase review round and resolve or escalate them before
  the phase is locked.

## Completion

- [ ] All findings are resolved or escalated with a reason
- [ ] The rename sweep and the prompt doctor were exercised and recorded
- [ ] `bun run mf:gate:fast` passes
- [ ] The review round is linked with `- Phase: B`
