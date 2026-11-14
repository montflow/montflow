---
id: C003
name: implement-board-and-mailboxes
type: execution
originator: planner:B004
size: medium
depends-on: C001
related-tasks: C005
status: complete
---

# Task C003: implement board and mailboxes

## Type: execution

## Description

Give parallel workers a broadcast channel and a targeted one, with an entry grammar the
verifier parses so append-only-identified-entries is a checked fact rather than a
convention.

## Requirements

- `BOARD.md` per phase and `MAILBOX.md` per task, both append-only; the parse rules from B004 are enforced by the verifier, which rejects a malformed entry and an unknown addressee by name.
- `mail` writes an addressed entry and delivers to a live target by steering the bound session; when the target is not live the entry waits and is read at that task start.
- `claim` records the session binding `mail` needs to find a live target; only a session holding the orchestrator binding may send `mail`, and the sender is derived from that binding (no `--from`).
- The rule that a mid-flight sibling need belongs in `depends-on` rather than in the channel is stated in the execution skill, and enforced wherever it can be mechanically enforced.
- Timestamps inside entries come from the stamping verb, never typed.

## Completion

- [x] A malformed or unknown-addressee entry is rejected by `check` with the offending line named, proven by an actual run
- [x] Delivery to a live session and queueing to a non-live task both demonstrated, with commands and outputs recorded in MEMORY.md
- [x] `ts:check`, `lint:check`, and `fmt:check` pass with tests for both paths
