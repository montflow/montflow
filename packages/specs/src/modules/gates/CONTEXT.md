# Gates module

Schema-free verification for one optional `GATES.md` — the per-task
validation checklist. Parses `## <Stage>` headings and their `- [ ]` /
`- [x]` items, then checks the shape: non-empty, at least one stage, at least
one item, no empty stage, no unfilled `<placeholder>` items. It also owns the
gate-progress rule: a task that claims `complete` must show at least one
checked item.

## Belongs here

- `parseGates`, `GateStage`, `GateItem` (text plus checked state)
- `verifyGatesFile` — the shape of the file
- `verifyGateProgress` — the completion rule; an all-unchecked gate on a
  complete task is `gate.unchecked`, a warning that never fails the check
- `GATE_UNCHECKED_CODE`

## Does not belong here

- Deciding whether the declared checks are the _right_ ones for the task
  — that is a review concern, not a mechanical one. The rule the authoring
  skill states — a gate names this task's own verification commands — is
  enforced by review, so the scaffold marks its stub `REPLACE`.
- Whether a task should have gates at all — `structure` owns the
  `Gates` column ↔ `GATES.md` agreement
- Whether the task is complete — `task` owns the status; `structure` passes it
