---
id: D099
name: review-phase
type: review
originator: user
depends-on: D001, D002, D003, D004
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task D099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase D: the migration of the six
trees, the fixtures and tests, the harden step that removes the legacy warning,
and the skills/docs alignment. The main risk is a migration that silently
rewrites content or a strictness flip that leaves a warning-shaped check behind.

## Requirements

- Verify the migration is a pure move: for every migrated spec, each `TASK.md`,
  `MEMORY.md`, and `GATES.md` is byte-identical to its pre-migration blob, and
  `SPEC.md` is untouched.
- Verify no spec lost or gained a task, and that ids, names, types, statuses,
  `depends-on`, `reviewer-profiles`, and `GATES` presence are unchanged.
- Verify the review link still binds every complete phase review to its round in
  every expected series, and that `mf:check:reviews` is unchanged.
- Verify the harden step: a flat task directory at the root is an error, no
  warning-only layout case survives, and no other finding changed severity.
- Verify the fixture matrix and the tests assert the real fields, not weakened
  versions.
- Verify both skill copies and the CHANGELOG agree, the packaged copy is current,
  and every doc names the phase layout.
- Verify the deferrals hold: no `PHASE.md`, no version field, no removal of
  `099` or `locked-phases` landed in this spec.
- Findings written to the phase review round.

## Completion

- [x] Findings written and reviewed.
- [x] Every finding names the artifact and the consequence, not just the absence.
