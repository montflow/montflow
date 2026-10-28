---
id: B099
name: review-phase
type: review
originator: user
depends-on: B002, B003
related-tasks:
status: pending
---

# Review Phase B: review phase

## Type: review

## Description

An independent run attacks the three decisions for under-specification, internal
contradiction, and scope that quietly grew during the design conversation.

## Requirements

- Hunt for decisions stated too loosely to implement: any place Phase C would have to invent a rule.
- Check the tier enum, the v2 tree, and the verb list for contradictions, especially that derived locks and the version field agree about what a v1 spec means.
- Check that nothing decided depends on a capability A002 proved is missing and Phase C does not schedule.
- Confirm the interaction budgets actually bound questions rather than restating ask-when-it-is-the-users-decision.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/B.md` and read by the human
- [ ] Accepted findings opened as defect tasks; others recorded with a disposition
- [ ] Phase C unblocked: every task there traceable to a decided rule
