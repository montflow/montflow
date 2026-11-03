---
id: B099
name: review-phase
type: review
originator: user
size: small
depends-on: B002, B004, B005
related-tasks:
status: pending
---

# Review Phase B: review phase

## Type: review

## Description

An independent run attacks the reconciliation and the three decisions for
under-specification, internal contradiction, and scope that quietly grew during
the design conversation. It also audits the migration and the completed-record
retrofit, because a green store is the proof that the new severities are honest.

## Requirements

- Hunt for decisions stated too loosely to implement: any place Phase C would have to invent a rule.
- Check the tier enum, the v2 tree, and the verb list for contradictions, especially that derived locks and the version field agree about what a v1 spec means.
- Check that nothing decided depends on a capability A002 proved is missing and Phase C does not schedule.
- Confirm the interaction budgets actually bound questions rather than restating ask-when-it-is-the-users-decision.
- Audit B001's migration and B002's retrofit: every completed task has a real size or `size: none`, and no completion or gate item was ticked without evidence.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/B.md` and read by the human
- [ ] Accepted findings opened as defect tasks; others recorded with a disposition
- [ ] Phase C unblocked: every task there traceable to a decided rule
