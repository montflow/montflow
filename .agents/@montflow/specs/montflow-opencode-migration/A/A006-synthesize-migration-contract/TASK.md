---
id: A006
name: synthesize-migration-contract
type: exploratory
originator: user
depends-on: A001, A002, A003, A004, A005
related-tasks:
status: complete
---

# Task A006: Synthesize the migration contract

## Type: exploratory

## Description

Consolidate A001–A005 into one migration contract: the mapping, the gaps, the
risks, and the candidate phase plan for Phase B to ratify.

## Requirements

- Present the consolidated capability matrix: Pi primitive → OpenCode surface → port strategy (adopt / adapt / re-layer / drop).
- Confirm, under the retire-`pi-sessions` hypothesis, that OpenCode's native session and subagent system is the single session mechanism and that no montflow engine is re-introduced; escalate any blocker explicitly.
- List the adapter seams required, each with its interface and the packages it serves.
- List the open risks with a likelihood/impact note and the execution phase that must resolve each.
- Propose the execution phase sequence for Phase B to ratify, cheapest-and-most-isolating first.
- Reconcile any contradictions between A001–A005 and name the unresolved questions.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Consolidated matrix and adapter-seam list captured in MEMORY.md
- [ ] Risk list with resolving phase captured
- [ ] Candidate execution sequence and unresolved questions recorded
