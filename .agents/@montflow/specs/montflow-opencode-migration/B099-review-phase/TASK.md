---
id: B099
name: review-phase
type: review
originator: user
depends-on:
related-tasks:
status: complete
---

# Task B099: Review phase B

## Type: review

## Description

Run an independent adversarial review over phase B. The phase produces
decisions, so the review tests whether each decision is justified by phase A
evidence, whether the retire-`pi-sessions` call is sound, and whether the
execution sequence and verification plan are actionable and reversible.

## Requirements

- Findings written to the phase review round of the `montflow-opencode-migration` review series.
- Each decision checked against the A-task evidence it cites; unsupported decisions recorded as findings.
- The package architecture, adapter seams, and session mapping challenged for hidden coupling and lost capability.
- The execution sequence challenged for order, cut criteria, missing rollback, and unverifiable checkpoints.

## Completion

- [ ] Findings written and reviewed
