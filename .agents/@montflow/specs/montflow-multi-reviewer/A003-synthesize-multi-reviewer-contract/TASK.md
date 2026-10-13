---
id: A003
name: synthesize-multi-reviewer-contract
type: exploratory
originator: user
depends-on: A001, A002
related-tasks:
status: pending
---

# Task A003: Synthesize the multi-reviewer contract

## Type: exploratory

## Description

Consolidate A001 and A002 into one contract: the chosen mechanism for multiple
reviewers, the concrete change list across packages, and the risks. Recommend
the series-per-profile convention over a merged-round approach, with reasons.

## Requirements

- Present the chosen mechanism (one series per reviewer profile) and why it beats merging reviewers into one round (isolation, `F<n>` uniqueness, round-file contention).
- Specify the review-task profile declaration (field name, order, default) and the derived series naming from spec name plus profile.
- List the concrete change list per package: `pi-specs` (task contract, review-link, scaffold, executing-spec), `pi-reviews` (dispatch, ledger), docs and changelogs.
- List the risks (unknown profile, existing-spec compatibility, round-number drift across series) with a likelihood/impact note and the phase that resolves each.
- Record the effect-reviewer binding decision input: which phase kinds declare it, and whether it replaces or joins the general reviewer.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Mechanism, declaration, and change list captured in MEMORY.md
- [ ] Risk list with resolving phase recorded
