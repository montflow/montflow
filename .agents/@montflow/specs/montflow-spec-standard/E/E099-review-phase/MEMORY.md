# Memory

## Context

Phase E review: hostile check of parallel phase authoring, the board/mailbox
protocol, and the verification scheduler. Series `montflow-spec-standard`
(rounds 005–010 carry phase-E attribution).

## Progress

- 2026-11-03: round 005 filed 10 findings (5 Major, 5 Minor); one batched fixer
  attempt landed.
- Round 006 re-review: 8 resolved, 2 carried open, 5 new (F11–F15). `decide`
  → `rework` (rounds 1/3).
- Round 007 re-review: 7 resolved, 4 new (F16–F19). `decide` → `overflow`
  (rounds 3/3).
- Round 008 re-review: 4 resolved, 3 new (F20–F22). `decide` → `escalate`,
  `review.overflow-exhausted`.
- User authorized one overflow round: round 009 re-review resolved 3, filed
  F23/F24/F25. `decide` → `escalate` again.
- User authorized one final round: round 010 resolved F24 and F25, carried F23
  open and filed F26 (Minor).
- Stopped at the authorized limit with F23 (Major) and F26 (Minor) open. Phase
  E is not locked; `E099` stays `in-progress`.

## Findings

- F23 (Major, still open): `finish` checks attempt ownership while holding
  `RUNS_LOCK`, then appends the record after the lock is released. A finisher
  that owned the last attempt at guard time can lose it during the append, so
  the older `fail` still lands after the newer `pass`; `verifyGateResults`
  reports `gate.unproven` while the run state says `passed`. Fix shape: hold the
  lock across the state write and the append, or re-check ownership after the
  append and drop/rewrite the record.
- F26 (Minor, open): `create --tasks "…:scope=app,lib,docs"` is refused although
  `init` and the verifier accept a three-path scope; the diagnostic names the
  wrong fragment.
- Resolved in this series: F1–F22 except F23 (scheduler single-flight, lease,
  write failure, freshness, generators, drift markers, `--scope` override,
  `init`/`create` grammar, record drift).

## Gates

- No `GATES.md` on the review task; no official gate run for it. The phase gate
  is `none`; the repo-wide gate runs at the phase boundary once the review
  passes, and it has not run because the review has not passed.

## Open Questions

- F23 needs user authorization for another review round (the phase is past
  `budget + 1` with a Major open). Alternative: a waiver, which bypasses the
  review gate on a known single-flight defect.

## Handoff

- Resume: fix F23 + F26 as one batch, then one re-review round with
  `- Overflow-authorized: user`. Round `010` is the round to fix in place.
- The E001/E002/E003 records were amended for F14 and F19; no other spec record
  was edited during the review.

## Deviations

- Rounds 009 and 010 ran as user-authorized overflows (`- Overflow:`,
  `- Overflow-authorized: user`), beyond the one autonomous overflow.
