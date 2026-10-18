# Gates module

Schema-free verification for one optional `GATES.md` — the per-task
validation checklist. Parses `## <Stage>` headings and their `- [ ]`
items, then checks the shape: non-empty, at least one stage, at least
one item, no empty stage, no unfilled `<placeholder>` items.

## Belongs here

- `parseGates`, `GateStage`
- `verifyGatesFile`

## Does not belong here

- Deciding whether the declared checks are the _right_ ones for the task
  — that is a review concern, not a mechanical one
- Whether a task should have gates at all — `structure` owns the
  `Gates` column ↔ `GATES.md` agreement
