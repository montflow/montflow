---
id: A005
name: synthesize-current-rules
type: exploratory
originator: user
depends-on: A001, A002, A003, A004
related-tasks:
status: complete
---

# Task A005: Synthesize the current rules

## Type: exploratory

## Description

Combine the inventories from A001–A004 into one picture of how the project
currently expects a TypeScript project to be structured. This is the input the
user interview in Phase B will react to.

## Requirements

- Rule matrix: for every structural rule, which skill states it, whether it is hard or a default, and whether another skill restates it.
- Overlap list: rules duplicated across skills (candidates for the unified entry point).
- Conflict list: rules that disagree or are ambiguous, with the exact sources.
- Gap list: structural decisions no current skill covers.
- Dependency graph: which skills the unified entry point would depend on, and the natural order to consult them.
- Candidate shape: a first proposal for the unified entry point (sections, pipeline, reference) — clearly marked as a proposal for the user to accept or reject.

## Completion

- [ ] Findings summarized in MEMORY.md
