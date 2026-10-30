---
id: C099
name: review-phase
type: review
originator: user
depends-on: C001, C002, C003
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task C099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase C: the snapshot change, the
strict layout verifier, the scaffold/CLI paths, and the migrate verb. Hunt for
the paths where the new tree silently drops a check rather than failing loudly.

## Requirements

- Verify the verifier against adversarial trees: a file at a phase level, an
  empty phase directory, a stray directory in a task directory, a task dir whose
  letters disagree with its phase dir, a four-segment path, a phase directory
  with no review task, a `locked-phases` entry with no directory. Each must
  produce exactly one actionable finding.
- Verify the inertness claim of C001: the same tree without directory entries
  and with them must produce identical findings.
- Verify `nest` still carries `severity`, `fix`, and `line` for every nested
  check, and that the legacy warning carries its `fix` target.
- Verify no consumer regressed: `next` gated detection, `status` grouping,
  `check` concurrency/report rendering, reviews' `verifySpecProfiles` scan.
- Verify `migrate` cannot lose data: contents byte-identical, no task
  overwritten, refusal on mixed/unknown, no-op on migrated, and dry-run clean.
- Verify `mf:check:specs` is warnings-only for the six legacy trees at the end of
  the phase and `mf:check:reviews` is unaffected.
- Findings written to the phase review round.

## Completion

- [x] Findings written and reviewed.
- [x] Every finding names the artifact and the consequence, not just the absence.
