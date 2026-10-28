---
id: A099
name: review-phase
type: review
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A099: Review phase A

## Type: review

## Description

Run an independent adversarial review over phase A. The phase produces an
inventory and a migration contract, so the review tests whether the evidence is
complete and grounded, whether claims cite real source paths, and whether the
retire-`pi-sessions` hypothesis is actually validated rather than assumed.

## Requirements

- Findings written to the phase review round of the `montflow-opencode-migration` review series.
- Each claim in the A-task memories checked against a source path, type signature, or runnable check.
- The retire-`pi-sessions` verdict challenged: confirm the native session/subagent system covers the listed capabilities, or name the missed blocker.
- Unresolved gaps and unstated assumptions recorded as findings.

## Completion

- [ ] Findings written and reviewed
