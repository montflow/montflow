---
id: E099
name: review-phase
type: review
originator: user
size: small
depends-on: E004
related-tasks:
reviewer-profiles: effect-reviewer
status: pending
---

# Task E099: review-phase

## Type: review

## Description

Run an independent adversarial review over phase E: identifier validation at every surface, the fresh-install skill gate, dispatch/check exit agreement, catalogue verification counts, and the README truth pass.

## Requirements

- Findings are written to the phase review round.
- Resolve or escalate every finding with a reason.
- Confirm no valid-spec behavior regressed.

## Completion

- [ ] Findings are resolved or escalated
- [ ] The review round is linked with `- Phase: E`
- [ ] `bun run mf:gate` passes
