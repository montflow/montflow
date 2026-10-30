---
id: G099
name: review-phase
type: review
originator: user
size: small
depends-on: G005
related-tasks:
reviewer-profiles: generic-reviewer
status: complete
---

# Task G099: review-phase

## Type: review

## Description

Run an independent adversarial review over phase G: catalogue omission reporting and check-catalog proof, the single-snapshot execute, the shared JSON verifier, the CLI split, and the doctor module boundary.

## Requirements

- Findings are written to the phase review round.
- Resolve or escalate every finding with a reason.
- Confirm the public CLI and prompt surfaces are unchanged.

## Completion

- [ ] Findings are resolved or escalated
- [ ] The review round is linked with `- Phase: G`
- [ ] `bun run mf:gate` passes
