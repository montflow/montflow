---
id: B004
name: decide-spec-standard-v2
type: planning
originator: planner:A099
size: medium
depends-on: B003
related-tasks:
status: pending
---

# Task B004: decide spec standard v2

## Type: planning

## Description

Specify the phase-as-entity contract on top of the rail B001 landed: `PHASE.md`,
the version field, gate kinds, and the board and mailbox channels that Phase C
will implement, in enough detail that an agent can build them without asking
anything. B001 already restored the phase directories, derived the phase lock
from completed tasks plus the review series, and deleted the hand-written lock
list and the reserved review task; this task decides the remaining contract.

## Requirements

- The `PHASE.md` contract (id, objective, status, review required-or-waived with reason, gate kind), and its memory and board files, built on B001's phase directories.
- Task id and directory scheme with numbering that restarts per phase, globally unique and flat enough to stay one sortable token.
- Confirm B001's derivation rule for locks (tasks complete, gate recorded, review round attributed to the phase) and decide where a review waiver is recorded so no hand-written lock list or contradiction state returns.
- Gate stage kinds mechanical and subjective: the recognizable `GATES.md` shape stays, each stage declares its kind, mechanical stages are executed with results recorded, subjective stages are consumed by a reviewer role. State what a recorded gate result looks like on disk.
- `SPEC.md` version field: read as 1 when absent, warn below current, error above, accept current and previous.
- `migrate` must transform the v1 flat tree and B001's phase tree into the v2 shape, and a version bump without transformation must be rejected.
- `BOARD.md` broadcast and `MAILBOX.md` targeted entry grammar, both append-only, with the parse rules the verifier enforces and the delivery path for a live session.
- The single-writer rule: which agent may write which field, and how a worker escalates instead of asking the user.
- What happens to an existing v1 spec when v2 lands, and the stated rule for reading the frozen complete specs.

## Completion

- [ ] The v2 contract written to MEMORY.md with every file, field, and enum a verifier will need
- [ ] Derivation and migration rules unambiguous enough to implement and test directly
- [ ] B001's delete list audited: no hand-written lock list, reserved review-task check, or contradiction state survives, and the review-waiver record is named
