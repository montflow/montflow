---
id: B002
name: decide-spec-standard-v2
type: planning
originator: planner:A099
depends-on: B001
related-tasks:
status: pending
---

# Task B002: decide spec standard v2

## Type: planning

## Description

Specify the phase-as-entity tree, the derived locks, the gate kinds, and the board and
mailbox channels that Phase C will implement, in enough detail that an agent can
build them without asking anything.

## Requirements

- Phase directory layout, the `PHASE.md` contract (id, objective, status, review required-or-waived with reason, gate kind), and its memory and board files.
- Task id and directory scheme with numbering that restarts per phase, globally unique and flat enough to stay one sortable token.
- Derivation rule for locks: tasks complete, gate recorded, review done or waived. State what happens to the hand-written lock list and to the contradiction state that existed to catch mistyped locks.
- Gate stage kinds mechanical and subjective: the recognizable `GATES.md` shape stays, each stage declares its kind, mechanical stages are executed with results recorded, subjective stages are consumed by a reviewer role. State what a recorded gate result looks like on disk.
- `SPEC.md` version field: read as 1 when absent, warn below current, error above, accept current and previous.
- `migrate` must transform the tree, and a version bump without transformation must be rejected.
- `BOARD.md` broadcast and `MAILBOX.md` targeted entry grammar, both append-only, with the parse rules the verifier enforces and the delivery path for a live session.
- The single-writer rule: which agent may write which field, and how a worker escalates instead of asking the user.
- What happens to an existing v1 spec when v2 lands, and the stated rule for reading the two frozen complete specs.

## Completion

- [ ] The v2 contract written to MEMORY.md with every file, field, and enum a verifier will need
- [ ] Derivation and migration rules unambiguous enough to implement and test directly
- [ ] The delete list explicit: the reserved review task id, its structure check, the hand-written lock list, and any check that existed only for them
