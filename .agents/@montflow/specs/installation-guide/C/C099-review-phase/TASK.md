---
id: C099
name: review-phase
type: review
originator: user
depends-on: C003
related-tasks: C001, C002, C003
reviewer-profiles:
status: complete
---

# Task C099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase C. The claim under test is that
an agent can install any single utility, or all of them, by following the guide
— and that no utility ever installs itself without being asked for.

## Requirements

- Findings written to the phase review round.
- Every utility command is traced against its package's CLI; a command that does
  not exist is a finding.
- A path through the guide that installs without asking is a finding.

## Completion

- [ ] Findings written and reviewed.
