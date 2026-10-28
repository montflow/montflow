---
id: A099
name: review-phase
type: review
originator: user
depends-on: A003, A004
related-tasks:
status: complete
---

# Review Phase A: review phase

## Type: review

## Description

An independent run adversarially reviews the Phase A inventories and the two verifier
changes: are the call-site lists complete, are the defects real, and did the
severity channel stay strictly additive.

## Requirements

- Review the A001 and A002 findings against the source, hunting for call sites or packages missed rather than restating what was found.
- Confirm A003 introduced no change to any existing error path and that warnings cannot fail CI without the opt-in.
- Confirm A004 resolution cannot make a legitimate artifact fail CI on a fresh clone.
- Every finding gets a human disposition before Phase B opens.

## Completion

- [x] Review written to `.agents/@montflow/reviews/montflow-spec-standard/001/REVIEW.md` and read by the human
- [x] Accepted findings turned into defect tasks; deferred and dismissed ones recorded as such
- [x] No open finding without a disposition
