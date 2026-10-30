---
id: F099
name: review-phase
type: review
originator: user
size: small
depends-on: F003
related-tasks:
reviewer-profiles: generic-reviewer
status: complete
---

# Task F099: review-phase

## Type: review

## Description

Run an independent adversarial review over phase F: grouped check warnings, completion and gate checks, the mechanical review-cycle budget, and the four surface nits.

## Requirements

- Findings are written to the phase review round.
- Resolve or escalate every finding with a reason.
- Confirm historical records were not rewritten to make a check green.

## Completion

- [ ] Findings are resolved or escalated
- [ ] The review round is linked with `- Phase: F`
- [ ] `bun run mf:gate` passes
