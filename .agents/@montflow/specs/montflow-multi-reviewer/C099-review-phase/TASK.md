---
id: C099
name: review-phase
type: review
originator: user
depends-on:
related-tasks:
status: pending
---

# Task C099: Review phase C

## Type: review

## Description

Run an independent adversarial review over phase C. The phase implements the
feature, so the review exercises the actual behavior: multiple profiles produce
multiple series, each round carries the profile, unknown profiles fail, and
existing single-reviewer specs are unchanged.

## Requirements

- Findings written to the phase review round of the `montflow-multi-reviewer` review series.
- The implementation checked against the phase B decisions, not just the phase C task text.
- The backward-compatibility claim tested against an existing spec and an existing series.
- Gate results from the execution tasks inspected, not trusted.

## Completion

- [ ] Findings written and reviewed
