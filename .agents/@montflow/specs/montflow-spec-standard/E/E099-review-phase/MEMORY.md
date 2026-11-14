# Memory

## Context

Phase E review: hostile check of parallel phase authoring, the board/mailbox
protocol, and the verification scheduler. Series `montflow-spec-standard`,
rounds 005–012.

## Progress

- 2026-11-03: round 005 filed 10 findings; one batched fixer attempt landed.
- Round 006: 8 resolved, 5 new; `rework`.
- Round 007: 7 resolved, 4 new; `overflow`.
- Round 008: 4 resolved, 3 new; `escalate` (autonomous overflow spent).
- Round 009 (user overflow): 3 resolved, 3 new.
- Round 010 (user overflow): F24/F25 resolved, F23 carried, F26 filed.
- Round 011 (user overflow): F23 and F26 resolved, F27 filed.
- Round 012 (user overflow): F27 resolved, no new findings. `review decide` →
  `pass`, `review.clean`, 0 open, budget 3 / 12 rounds used.
- Closed the task; the phase gate (E002/E003 stage 3) re-ran green and the
  repo-wide gate `bun run mf:gate` exited 0.

## Findings

- 27 findings filed, all resolved. The scheduler kept the single-flight
  invariant through four rounds of adversarial probing: F23 (terminal write vs
  record append), F27 (waiter reused-record append outside the runs lock).
- Resolved in code: `56f003c4` (races + gate scope), `62af1d5c` (waiter record
  under the lock, multi-path scope).

## Gates

- E002 stage 3: `bun run --cwd packages/specs test` — 140 files, 2053 tests.
- E003 stage 3: `bun run --cwd packages/specs test -- src/modules/prompt/tests/lean-contract.test.ts`.
- Repo-wide: `bun run mf:gate` exit 0, `14 specs · 0 failed · 0 issues`.

## Open Questions

- None. A parallel session's half-built doctor-agents work briefly made the
  package suite red; it was withdrawn before the final runs.

## Handoff

- Phase E is locked. Rounds 005–012 are the evidence trail; read them before
  changing the scheduler.

## Deviations

- Four user-authorized overflow rounds past the autonomous budget (010, 011,
  012 plus 009), each recorded with `- Overflow-authorized: user`.
