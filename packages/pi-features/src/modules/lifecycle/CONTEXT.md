# Lifecycle module

Derives and validates a feature's lifecycle: is it not started, active,
blocked, complete, or _inconsistent_ (a bookkeeping contradiction)?

## Belongs here

- `STATES`, `State`, `Input`, `TaskEntry`, `PhaseSummary`, `Analysis`
- `analyze` — derived state + per-status/per-phase roll-up
- `verify` — invalid-state rules:
  - `status: complete` requires every task complete and every phase locked
  - all tasks complete + all phases locked requires `status: complete`
  - a locked phase must be fully complete
  - locked phases must form a prefix (no forward locking)

## Does not belong here

- File parsing — `feature` / `task` own that
- Tree structure (placement, table agreement, dependencies) — `structure`
- Rendering — the `cli` app

## State vs structure

`structure` answers "are the files shaped right?"; `lifecycle` answers
"does the declared status match the work?". Both feed verification;
`structure` embeds these issues into the tree result.
