---
id: B099
name: review-phase
type: review
originator: user
depends-on: B004
related-tasks: B001, B002, B003, B004
reviewer-profiles:
status: complete
---

# Task B099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase B. The claim under test is
that `mf-skills sync` publishes exactly the public skills, never mutates a
target it did not install, and behaves identically through the binary and the
slash command.

## Requirements

- Findings written to the phase review round.
- A command that writes during `--check`, copies an internal skill, or diverges
  between front ends is a finding.

## Completion

- [ ] Findings written and reviewed.
