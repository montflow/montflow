---
id: B099
name: review-phase
type: review
originator: user
depends-on: B001, B002
related-tasks:
reviewer-profiles:
status: complete
---

# Task B099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase B: the verifier contract and
the tooling/rollout contract. The failure worth hunting is a decision that lets
the repo gate go red mid-phase, or that quietly invents C001's scope.

## Requirements

- Replay B001's finding table against the current `verifySpecTree`: each new
  finding has a trigger that can actually occur in the snapshot shape described,
  and no existing finding loses its severity or `fix` through `nest`.
- Check the warning→error transition end to end: C002 emits the legacy warning,
  D001 migrates, D003 deletes the branch. Confirm `mf:check:specs` is green at
  every intermediate state and that no C task depends on a red gate.
- Replay B002's `migrate` contract for the refusal cases: mixed tree, unknown
  spec, already migrated, empty phase directory, stray root entry. Each state
  must have a defined outcome and a message.
- Check the fixture matrix covers the new failure modes and that the exact
  asserted fields match B001's table.
- Check the skill/docs list is complete: both `montflow-create-pi-specs` copies,
  its CHANGELOG, `AUTHORING_SPEC`, `EXECUTING_SPEC`, README, fixtures README, and
  the `CONTEXT.md` files. Flag any packaged artifact left stale for
  `mf:check:skills`.
- Findings written to the phase review round.

## Completion

- [x] Findings written and reviewed.
- [x] Every finding names the artifact and the consequence, not just the absence.
