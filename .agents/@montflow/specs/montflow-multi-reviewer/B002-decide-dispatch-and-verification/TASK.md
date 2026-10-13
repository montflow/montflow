---
id: B002
name: decide-dispatch-and-verification
type: planning
originator: user
depends-on: A003, B001
related-tasks:
status: pending
---

# Task B002: Decide dispatch and verification changes

## Type: planning

## Description

Decide how a declared profile drives a reviewer session and how the verifiers
change, so the tooling stays testable without a running agent session.

## Requirements

- Decide how dispatch starts one session per profile: how the profile's model and thinking are applied, how its skills are loaded, and how the profile reaches the spawned session.
- Decide how the series ledger `Profile:` is stamped and how the existing `ProfileProbe` verification is used per series.
- Decide the review-link verifier change: accepting a set of expected series, and the exact issue raised for a missing round in any series.
- Decide the task-contract and scaffold verifier changes and the tests that cover them.
- Decide what is deliberately left out (for example, per-reviewer tool sets or per-reviewer prompts beyond the profile).
- Record the interface changes and the files that will hold them.

## Completion

- [ ] Dispatch and ledger changes recorded
- [ ] Verifier changes and test plan recorded
- [ ] Deliberate non-changes listed
